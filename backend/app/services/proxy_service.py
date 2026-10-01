import httpx
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse

# Lightweight script injected into proxied HTML pages to synchronize scrolling, clicks, and navigation
INJECTED_COBROWSE_SCRIPT = """
<script id="streamroom-cobrowse-agent">
(function() {
    let isRemoteAction = false;
    let throttleTimeout = null;

    // Report scroll position as percentage
    window.addEventListener('scroll', function() {
        if (isRemoteAction) return;
        const maxScrollTop = document.documentElement.scrollHeight - window.innerHeight;
        const maxScrollLeft = document.documentElement.scrollWidth - window.innerWidth;
        
        const topPct = maxScrollTop > 0 ? window.scrollY / maxScrollTop : 0;
        const leftPct = maxScrollLeft > 0 ? window.scrollX / maxScrollLeft : 0;

        if (throttleTimeout) return;
        throttleTimeout = setTimeout(function() {
            throttleTimeout = null;
            window.parent.postMessage({
                source: 'streamroom-cobrowse',
                type: 'scroll',
                topPct: topPct,
                leftPct: leftPct
            }, '*');
        }, 50);
    }, { passive: true });

    // Intercept clicks on links and elements
    document.addEventListener('click', function(e) {
        if (isRemoteAction) return;
        const target = e.target;
        const link = target.closest('a');
        if (link && link.href) {
            e.preventDefault();
            window.parent.postMessage({
                source: 'streamroom-cobrowse',
                type: 'navigate',
                url: link.href
            }, '*');
            return;
        }

        // Send click coordinates normalized to viewport
        const xPct = e.clientX / window.innerWidth;
        const yPct = e.clientY / window.innerHeight;
        window.parent.postMessage({
            source: 'streamroom-cobrowse',
            type: 'click',
            xPct: xPct,
            yPct: yPct
        }, '*');
    }, true);

    // Track mouse movement for pointer sharing
    let mouseThrottle = null;
    document.addEventListener('mousemove', function(e) {
        if (isRemoteAction) return;
        if (mouseThrottle) return;
        mouseThrottle = setTimeout(function() {
            mouseThrottle = null;
            window.parent.postMessage({
                source: 'streamroom-cobrowse',
                type: 'cursor',
                xPct: e.clientX / window.innerWidth,
                yPct: e.clientY / window.innerHeight
            }, '*');
        }, 40);
    }, { passive: true });

    // Listen for instructions from parent React container
    window.addEventListener('message', function(event) {
        if (!event.data || event.data.target !== 'streamroom-cobrowse-child') return;
        const msg = event.data;

        if (msg.type === 'remote_scroll') {
            isRemoteAction = true;
            const maxScrollTop = document.documentElement.scrollHeight - window.innerHeight;
            const maxScrollLeft = document.documentElement.scrollWidth - window.innerWidth;
            window.scrollTo({
                top: (msg.topPct || 0) * maxScrollTop,
                left: (msg.leftPct || 0) * maxScrollLeft,
                behavior: 'smooth'
            });
            setTimeout(function() { isRemoteAction = false; }, 100);
        } else if (msg.type === 'remote_click') {
            const x = (msg.xPct || 0) * window.innerWidth;
            const y = (msg.yPct || 0) * window.innerHeight;
            const elem = document.elementFromPoint(x, y);
            if (elem) {
                isRemoteAction = true;
                elem.click();
                setTimeout(function() { isRemoteAction = false; }, 100);
            }
        }
    });
})();
</script>
"""

class WebProxyService:
    @staticmethod
    async def fetch_and_transform_page(target_url: str, base_proxy_url: str) -> tuple[str, str]:
        """Fetch target web page, strip framing headers, rewrite relative assets, and inject sync agent."""
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
        
        async with httpx.AsyncClient(follow_redirects=True, timeout=12.0, verify=False) as client:
            resp = await client.get(target_url, headers=headers)
            content_type = resp.headers.get("content-type", "text/html")
            
            if "text/html" not in content_type:
                return resp.text, content_type

            soup = BeautifulSoup(resp.text, "html.parser")

            # Rewrite relative asset paths so stylesheets and images load properly
            for tag in soup.find_all(["link", "script", "img", "source", "video", "audio"]):
                for attr in ["src", "href"]:
                    if tag.has_attr(attr):
                        val = tag[attr]
                        if not val.startswith("data:") and not val.startswith("blob:"):
                            tag[attr] = urljoin(str(resp.url), val)

            # Inject the sync bridge script before </head> or </body>
            head = soup.find("head")
            agent_soup = BeautifulSoup(INJECTED_COBROWSE_SCRIPT, "html.parser")
            if head:
                head.append(agent_soup)
            else:
                body = soup.find("body")
                if body:
                    body.append(agent_soup)
                else:
                    soup.append(agent_soup)

            return str(soup), "text/html"
