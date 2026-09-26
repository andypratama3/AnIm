/**
 * Geometry for the A2A constellation.
 *
 * The numbers live here rather than inline in the SVG so the crowding
 * constraint can be tested. Twenty-six nodes sit on one ring, so the arc
 * between two neighbours is the budget every bubble has to fit inside: at
 * RADIUS 218 that is about 53px. The bubbles used to be 56px across, which
 * means neighbours overlapped by construction and no amount of label work
 * could fix it. Bubbles are now smaller than the arc that holds them, and
 * `mesh-layout.test.mjs` fails if that stops being true.
 */

export const SIZE = 620;
export const CENTER = SIZE / 2;
export const RADIUS = 218;

/** The orchestrator keeps a little more room because it carries a longer name. */
export const ORCH_RADIUS = 22;
export const AGENT_RADIUS = 18;

export function bubbleRadius(agentId: string): number {
  return agentId === "default" ? ORCH_RADIUS : AGENT_RADIUS;
}

/**
 * Where the two label lines sit, derived from the bubble rather than written
 * out as constants.
 *
 * Shrinking the circles without moving the text would leave the port label
 * floating 40px below an 18px bubble, which reads as detached and collides with
 * the next node's label. Tying the offsets to the radius keeps each label
 * attached to its own bubble at any size.
 */
export function labelOffsets(agentId: string) {
  const r = bubbleRadius(agentId);
  return {
    /** 4-character glyph, optically centred on the circle. */
    glyph: r * 0.36,
    glyphFont: agentId === "default" ? 12 : 10,
    /** Full agent id, under the bubble. */
    name: r + 16,
    nameFont: 9.5,
    /** Port, below the id. */
    port: r + 26,
    portFont: 8.5,
  };
}

/** Arc length between neighbouring nodes on the ring. */
export function arcSpacing(count: number, radius: number = RADIUS): number {
  if (count <= 0) return Number.POSITIVE_INFINITY;
  return (2 * Math.PI * radius) / count;
}

/**
 * Is there clearance between neighbouring bubbles?
 *
 * `worst` is the largest bubble in play, because one oversized node is enough
 * to make the ring look crowded even when the rest are small.
 */
export function bubblesFit(count: number, radius: number = RADIUS): boolean {
  if (count === 0) return true;
  return 2 * Math.max(ORCH_RADIUS, AGENT_RADIUS) < arcSpacing(count, radius);
}

import type { Agent } from "@/lib/types";
import type { MeshLink } from "@/lib/types";

/**
 * Is this agent doing anything?
 *
 * `offline` means the process is not running, so it holds no slot on the ring
 * and takes no part in the topology. Nineteen of twenty-six profiles were
 * stopped, which is why the ring read as noise: the chart spent most of its
 * area on nodes that could not answer.
 */
export function isActive(agent: Agent): boolean {
  return agent.status !== "offline";
}

export function activeAgents(agents: Agent[]): Agent[] {
  return agents.filter(isActive);
}

/**
 * Links whose two ends are both on the ring.
 *
 * A link to a hidden node would be a line running to nothing, and counting it
 * in the header badge would report connections the chart does not draw. The
 * header and the drawing have to come from the same list.
 */
export function visibleLinks(links: MeshLink[], agents: Agent[]): MeshLink[] {
  const shown = new Set(activeAgents(agents).map((agent) => agent.id));
  return links.filter((link) => shown.has(link.source) && shown.has(link.target));
}
