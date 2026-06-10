import argparse
import json
import sys
import urllib.error
import urllib.request
from typing import Any


DEFAULT_BASE_URL = "http://localhost:3000"


def request_json(base_url: str, path: str, method: str = "GET", data: dict[str, Any] | None = None) -> dict[str, Any]:
    headers: dict[str, str] = {}
    body = None
    if data is not None:
        body = json.dumps(data).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(f"{base_url}{path}", data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {path} failed with HTTP {exc.code}: {detail}") from exc
    except Exception as exc:
        raise RuntimeError(f"{method} {path} failed: {exc}") from exc


def require_template(templates: dict[str, dict[str, Any]], xml_tag: str) -> dict[str, Any]:
    template = templates.get(xml_tag)
    if not template:
        raise RuntimeError(f"Template not found in /api/agent/schema: {xml_tag}")
    return template


def make_node(template: dict[str, Any], node_id: str, x: int, y: int, properties: dict[str, Any], label: str | None = None) -> dict[str, Any]:
    return {
        "id": node_id,
        "type": template["type"],
        "label": label or template["label"],
        "xmlTag": template["xmlTag"],
        "x": x,
        "y": y,
        "properties": properties,
        "propertiesSchema": template.get("propertiesSchema", []),
        "inputs": template.get("inputs", []),
        "outputs": template.get("outputs", []),
    }


def build_demo_workspace(templates: dict[str, dict[str, Any]]) -> dict[str, Any]:
    cue_t = require_template(templates, "cue")
    event_t = require_template(templates, "event_cue_signalled")
    sound_t = require_template(templates, "play_sound")
    notify_t = require_template(templates, "show_notification")
    reward_t = require_template(templates, "reward_player")

    nodes = [
        make_node(
            cue_t,
            "cue_agent_demo",
            120,
            120,
            {"name": "Agent_Demo_Cue", "instantiate": "false", "namespace": "this", "state": "active"},
            "Cue: Agent Demo",
        ),
        make_node(
            event_t,
            "event_agent_demo_start",
            120,
            420,
            {"cue": "md.Setup.Start"},
            "Event: Game Started",
        ),
        make_node(
            sound_t,
            "action_agent_demo_sound",
            520,
            120,
            {"object": "playership", "sound": "notification_generic"},
            "Play Notification Sound",
        ),
        make_node(
            notify_t,
            "action_agent_demo_notify",
            840,
            120,
            {"text": "'Agent API demo compiled successfully.'", "timeout": "5s"},
            "Show Agent Notification",
        ),
        make_node(
            reward_t,
            "action_agent_demo_reward",
            1180,
            120,
            {"money": 1000, "notification": "true", "standing": "", "faction": ""},
            "Reward Player",
        ),
    ]

    links = [
        {
            "id": "link_agent_demo_condition",
            "sourceNodeId": "cue_agent_demo",
            "sourcePortId": "out_cond",
            "targetNodeId": "event_agent_demo_start",
            "targetPortId": "in_cond",
        },
        {
            "id": "link_agent_demo_action_0",
            "sourceNodeId": "cue_agent_demo",
            "sourcePortId": "out_act",
            "targetNodeId": "action_agent_demo_sound",
            "targetPortId": "in_act",
        },
        {
            "id": "link_agent_demo_action_1",
            "sourceNodeId": "action_agent_demo_sound",
            "sourcePortId": "out_next",
            "targetNodeId": "action_agent_demo_notify",
            "targetPortId": "in_act",
        },
        {
            "id": "link_agent_demo_action_2",
            "sourceNodeId": "action_agent_demo_notify",
            "sourcePortId": "out_next",
            "targetNodeId": "action_agent_demo_reward",
            "targetPortId": "in_act",
        },
    ]

    return {
        "id": "workspace_agent_api_demo",
        "name": "Agent_API_Demo",
        "version": "1.0.0",
        "author": "Agent API",
        "description": "Workspace created through /api/agent/schema, /api/agent/workspace, and /api/agent/compile.",
        "nodes": nodes,
        "links": links,
        "uiWidgets": [],
        "uiTheme": {
            "backgroundColor": "#0F1115",
            "borderColor": "#06b6d4",
            "accentColor": "#0891b2",
            "opacity": 0.95,
            "showIcons": True,
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Create and compile a demo X4 Mod Studio workspace through the Agent API.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--dry-run", action="store_true", help="Build the workspace payload but do not POST it.")
    args = parser.parse_args()

    schema = request_json(args.base_url, "/api/agent/schema")
    curated = schema.get("node_templates", [])
    generated = schema.get("schema_node_templates", [])
    templates = {template["xmlTag"]: template for template in [*generated, *curated]}

    print("Agent API schema loaded")
    print(f"  curated templates: {len(curated)}")
    print(f"  generated schema templates: {len(generated)}")
    print(f"  schema library loaded: {schema.get('schema_library_loaded')}")

    workspace = build_demo_workspace(templates)
    if args.dry_run:
        print(json.dumps(workspace, indent=2))
        return 0

    update = request_json(args.base_url, "/api/agent/workspace", method="POST", data={"workspace": workspace})
    print(f"Workspace update: {update.get('message')} version={update.get('version')}")

    compiled = request_json(args.base_url, "/api/agent/compile", method="POST", data={})
    print(f"Compile success: {compiled.get('success')}")
    diagnostics = compiled.get("diagnostics", [])
    print(f"Diagnostics: {len(diagnostics)}")
    for diagnostic in diagnostics:
        print(f"  [{diagnostic.get('severity')}] {diagnostic.get('message')}")

    md_xml = compiled.get("files", {}).get("mission_director_xml", "")
    print("\nGenerated Mission Director XML:")
    print("-" * 60)
    print(md_xml)
    print("-" * 60)
    return 0 if compiled.get("success") else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)
