import { handleGetDocumentInfo } from "./handlers/document";
import { handleGetSelection } from "./handlers/selection";
import { handleGetNodeById } from "./handlers/node";
import { handleGetStyles } from "./handlers/styles";
import { handleGetVariables } from "./handlers/variables";
import { handleGetComponents } from "./handlers/components";
import { handleGetDesignContext } from "./handlers/context";
import { handleGetScreenshot } from "./handlers/screenshot";
import { handleGetDevSummary } from "./handlers/dev-summary";

// Show the UI (contains WebSocket client)
figma.showUI(__html__, { visible: true, width: 280, height: 180 });

// Route incoming requests from the UI's WebSocket relay
figma.ui.on("message", async (msg) => {
  if (msg.type === "ws-request") {
    const request = msg.payload as { id: string; type: string; params: Record<string, unknown> };

    try {
      const data = await handleRequest(request.type, request.params);
      figma.ui.postMessage({
        type: "ws-response",
        payload: { id: request.id, success: true, data },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      figma.ui.postMessage({
        type: "ws-response",
        payload: { id: request.id, success: false, error: message },
      });
    }
  }

  if (msg.type === "connection-status") {
    const status = msg.connected ? "connected" : "disconnected";
    console.log(`[MCP Bridge] WebSocket ${status}`);
  }
});

async function handleRequest(type: string, params: Record<string, unknown>): Promise<unknown> {
  switch (type) {
    case "get_document_info":
      return handleGetDocumentInfo();
    case "get_selection":
      return handleGetSelection(params as { depth?: number });
    case "get_node_by_id":
      return handleGetNodeById(params as { nodeId: string; depth?: number; properties?: string[] });
    case "get_styles":
      return handleGetStyles(params as { styleType?: "paint" | "text" | "effect" | "grid" });
    case "get_variables":
      return handleGetVariables(params as { collection?: string; type?: "COLOR" | "FLOAT" | "STRING" | "BOOLEAN" });
    case "get_components":
      return handleGetComponents(params as { name?: string });
    case "get_design_context":
      return handleGetDesignContext(params as { nodeId?: string });
    case "get_screenshot":
      return handleGetScreenshot(params as { nodeId: string; scale?: number; format?: "PNG" | "JPG" | "SVG" });
    case "get_dev_summary":
      return handleGetDevSummary(params as { nodeId?: string; include_screenshot?: boolean; max_width?: number });
    default:
      throw new Error(`Unknown request type: ${type}`);
  }
}

// Keep the plugin alive - do not close
console.log("[MCP Bridge] Plugin started. Waiting for WebSocket connection...");
