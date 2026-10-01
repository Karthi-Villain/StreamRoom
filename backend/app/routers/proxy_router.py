from fastapi import APIRouter, HTTPException, Query, Response
from app.services.proxy_service import WebProxyService

router = APIRouter(prefix="/proxy", tags=["Co-Browsing Proxy"])

@router.get("")
async def proxy_web_page(url: str = Query(...)):
    """Fetch external web page, strip X-Frame-Options/CSP, and inject co-browse sync agent."""
    if not url.startswith("http://") and not url.startswith("https://"):
        raise HTTPException(status_code=400, detail="Invalid URL protocol. Must start with http:// or https://")

    try:
        transformed_html, content_type = await WebProxyService.fetch_and_transform_page(url, "/api/v1/proxy")
        
        response = Response(content=transformed_html, media_type=content_type)
        # Explicitly ensure frame embedding headers are clean
        response.headers["X-Frame-Options"] = "ALLOWALL"
        response.headers["Access-Control-Allow-Origin"] = "*"
        return response
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to proxy website: {str(e)}")
