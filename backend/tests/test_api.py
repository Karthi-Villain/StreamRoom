import pytest
import httpx
from app.main import app
from app.db.database import init_db

pytestmark = pytest.mark.anyio

@pytest.fixture
def anyio_backend():
    return "asyncio"

@pytest.fixture(autouse=True)
def setup_database():
    init_db()

@pytest.fixture
async def async_client():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

async def test_health_endpoint(async_client):
    response = await async_client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "database" in data

async def test_create_and_query_public_room(async_client):
    payload = {
        "host_client_id": "test_client_001",
        "host_display_name": "Host Alice",
        "access_mode": "public",
        "control_policy": "host_only",
        "media_mode": "video_stream",
        "stream_url": "https://cdn.example.com/stream.m3u8",
        "diagnostics_enabled": True
    }
    create_resp = await async_client.post("/api/v1/rooms", json=payload)
    assert create_resp.status_code == 201
    room_data = create_resp.json()

    room_id = room_data["room_id"]
    assert len(room_id) == 12
    assert room_id.isalnum()
    assert "host_token" in room_data
    assert "session_token" in room_data

    status_resp = await async_client.get(f"/api/v1/rooms/{room_id}")
    assert status_resp.status_code == 200
    meta = status_resp.json()
    assert meta["exists"] is True
    assert meta["access_mode"] == "public"

async def test_pin_protected_room_flow(async_client):
    payload = {
        "host_client_id": "test_client_002",
        "host_display_name": "Host Bob",
        "access_mode": "pin",
        "pin": "987654",
        "control_policy": "collaborative",
        "media_mode": "video_stream",
        "diagnostics_enabled": False
    }
    create_resp = await async_client.post("/api/v1/rooms", json=payload)
    assert create_resp.status_code == 201
    room_id = create_resp.json()["room_id"]

    # Wrong PIN
    wrong_pin_resp = await async_client.post(f"/api/v1/rooms/{room_id}/join-request", json={
        "client_id": "visitor_001",
        "display_name": "Visitor Dave",
        "pin": "000000"
    })
    assert wrong_pin_resp.status_code == 401

    # Correct PIN
    correct_pin_resp = await async_client.post(f"/api/v1/rooms/{room_id}/join-request", json={
        "client_id": "visitor_001",
        "display_name": "Visitor Dave",
        "pin": "987654"
    })
    assert correct_pin_resp.status_code == 200
    assert correct_pin_resp.json()["status"] == "approved"

async def test_host_approval_knocking_flow(async_client):
    payload = {
        "host_client_id": "test_client_003",
        "host_display_name": "Host Charlie",
        "access_mode": "approval",
        "control_policy": "host_only",
        "media_mode": "video_stream",
        "diagnostics_enabled": True
    }
    create_resp = await async_client.post("/api/v1/rooms", json=payload)
    assert create_resp.status_code == 201
    room_id = create_resp.json()["room_id"]

    knock_resp = await async_client.post(f"/api/v1/rooms/{room_id}/join-request", json={
        "client_id": "visitor_knock_01",
        "display_name": "Waiting Visitor"
    })
    assert knock_resp.status_code == 200
    assert knock_resp.json()["status"] == "pending_approval"

async def test_update_room_settings_and_db_persistence(async_client):
    payload = {
        "host_client_id": "host_updater",
        "host_display_name": "Host Diana",
        "access_mode": "public",
        "control_policy": "host_only",
        "media_mode": "video_stream",
        "stream_url": "https://cdn.example.com/initial.m3u8",
        "diagnostics_enabled": False
    }
    create_resp = await async_client.post("/api/v1/rooms", json=payload)
    assert create_resp.status_code == 201
    room_id = create_resp.json()["room_id"]
    host_token = create_resp.json()["host_token"]

    update_resp = await async_client.patch(
        f"/api/v1/rooms/{room_id}/settings",
        json={
            "control_policy": "collaborative",
            "media_mode": "web_page",
            "web_url": "https://en.wikipedia.org/wiki/WebRTC",
            "diagnostics_enabled": True
        },
        headers={"Authorization": f"Bearer {host_token}"}
    )
    assert update_resp.status_code == 200
    updated_settings = update_resp.json()["settings"]
    assert updated_settings["control_policy"] == "collaborative"
    assert updated_settings["media_mode"] == "web_page"
    assert updated_settings["web_url"] == "https://en.wikipedia.org/wiki/WebRTC"
    assert updated_settings["diagnostics_enabled"] is True

async def test_resume_host_session_on_reload(async_client):
    # 1. Host creates room
    host_cid = "persistent_host_fingerprint_guid"
    create_resp = await async_client.post("/api/v1/rooms", json={
        "host_client_id": host_cid,
        "host_display_name": "Host Boss",
        "access_mode": "public",
        "control_policy": "host_only",
        "media_mode": "video_stream",
        "diagnostics_enabled": True
    })
    assert create_resp.status_code == 201
    room_id = create_resp.json()["room_id"]
    host_token = create_resp.json()["host_token"]

    # 2. Simulate page reload: client resumes session with persistent host_cid
    resume_resp = await async_client.post(f"/api/v1/rooms/{room_id}/resume-session", json={
        "client_id": host_cid,
        "host_token": host_token
    })
    assert resume_resp.status_code == 200
    res_data = resume_resp.json()
    assert res_data["status"] == "approved"
    assert res_data["is_host"] is True
    assert res_data["display_name"] == "Host Boss"
    assert "session_token" in res_data

async def test_audio_and_subtitle_track_synchronization(async_client):
    from app.services.room_manager import room_manager
    from app.services.sync_engine import SyncEngine

    # 1. Create a room
    host_cid = "host_track_test_cid"
    create_resp = await async_client.post("/api/v1/rooms", json={
        "host_client_id": host_cid,
        "host_display_name": "Host Track DJ",
        "access_mode": "public",
        "control_policy": "host_only",
        "media_mode": "video_stream",
        "stream_url": "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
        "diagnostics_enabled": True
    })
    assert create_resp.status_code == 201
    room_id = create_resp.json()["room_id"]

    room = room_manager.get_room(room_id)
    assert room is not None

    # 2. Host selects audio track 1 (e.g., Spanish or commentary track)
    await SyncEngine.handle_track_change(room, host_cid, {
        "track_type": "audio",
        "track_id": 1
    })
    assert room.video_state.active_audio_track == 1

    # 3. Host selects subtitle track 0 (e.g., English captions)
    await SyncEngine.handle_track_change(room, host_cid, {
        "track_type": "subtitle",
        "track_id": 0
    })
    assert room.video_state.active_subtitle_track == 0

    # 4. Host turns off subtitles (-1)
    await SyncEngine.handle_track_change(room, host_cid, {
        "track_type": "subtitle",
        "track_id": -1
    })
    assert room.video_state.active_subtitle_track == -1

async def test_low_latency_controls_sync(async_client):
    from app.services.room_manager import room_manager
    from app.services.sync_engine import SyncEngine
    import time

    # 1. Create room
    host_cid = "host_controls_cid"
    create_resp = await async_client.post("/api/v1/rooms", json={
        "host_client_id": host_cid,
        "host_display_name": "Host Fast",
        "access_mode": "public",
        "control_policy": "host_only",
        "media_mode": "video_stream",
        "stream_url": "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8"
    })
    assert create_resp.status_code == 201
    room_id = create_resp.json()["room_id"]
    room = room_manager.get_room(room_id)

    # 2. Host plays at position 10.0s
    t_start = time.time()
    await SyncEngine.handle_video_play(room, host_cid, {"position": 10.0, "playback_rate": 1.0})
    latency = time.time() - t_start
    assert latency < 0.05  # sub-50ms execution
    assert room.video_state.status.value == "playing"
    assert room.video_state.reference_position == 10.0

    # 3. Host seeks to 125.5s
    await SyncEngine.handle_video_seek(room, host_cid, {"target_position": 125.5})
    assert room.video_state.reference_position == 125.5

    # 4. Host pauses
    await SyncEngine.handle_video_pause(room, host_cid, {"position": 127.0})
    assert room.video_state.status.value == "paused"
    assert room.video_state.reference_position == 127.0
