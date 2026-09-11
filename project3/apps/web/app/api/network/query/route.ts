import { NextRequest, NextResponse } from "next/server";
import { masterGraph } from "@/aetheris/core/fabric/graph";

export const dynamic = "force-dynamic";

/**
 * GET /api/network/query
 * Supports queries like:
 * ?focus=core-ravana (returns subgraph centered on target node)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const focus = searchParams.get("focus");

  if (focus) {
    const subgraph = masterGraph.getFocusedView(focus);
    return NextResponse.json({
      ok: true,
      focus,
      focusedNode: subgraph.focusedNode,
      connectedNodes: subgraph.connectedNodes,
      connectedEdges: subgraph.connectedEdges,
      diagnostics: subgraph.diagnostics,
    });
  }

  return NextResponse.json({
    ok: true,
    nodes: masterGraph.getAllNodes(),
    edges: masterGraph.getAllEdges(),
  });
}
