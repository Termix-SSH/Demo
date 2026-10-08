import { get, post } from "../../router";
import { value } from "../../store";

const P = "/plugin-api/network-topology";

type Node = {
  data: { id: string; label?: string; parent?: string; color?: string };
  position?: { x: number; y: number };
};
type Edge = { data: { id: string; source: string; target: string } };

function group(id: string, label: string, color: string): Node {
  return { data: { id, label, color } };
}
function host(id: number, parent: string, x: number, y: number): Node {
  return { data: { id: String(id), parent }, position: { x, y } };
}
function link(source: number | string, target: number | string): Edge {
  return {
    data: {
      id: `e-${source}-${target}`,
      source: String(source),
      target: String(target),
    },
  };
}

const topology = value<{ nodes: Node[]; edges: Edge[] }>("topology-v2", () => ({
  nodes: [
    group("g-prod", "Production", "#f39044"),
    group("g-lab", "Homelab", "#22c55e"),
    group("g-edge", "Edge", "#3b82f6"),
    host(15, "g-lab", 510, 320),
    host(7, "g-lab", 0, 480),
    host(8, "g-lab", 260, 480),
    host(9, "g-lab", 520, 480),
    host(10, "g-lab", 780, 480),
    host(11, "g-lab", 260, 620),
    host(12, "g-lab", 520, 620),
    host(6, "g-prod", 510, 120),
    host(1, "g-prod", 120, -40),
    host(2, "g-prod", 380, -40),
    host(3, "g-prod", 640, -40),
    host(5, "g-prod", 900, -40),
    host(4, "g-prod", 640, -180),
    host(13, "g-edge", 1240, 40),
    host(14, "g-edge", 1240, 180),
  ],
  edges: [
    link(15, 7),
    link(15, 8),
    link(15, 9),
    link(15, 10),
    link(15, 11),
    link(15, 12),
    link(15, 6),
    link(6, 1),
    link(6, 2),
    link(6, 3),
    link(6, 5),
    link(3, 4),
    link(1, 3),
    link(6, 13),
    link(6, 14),
  ],
}));

get(`${P}/`, () => topology.get());
post(`${P}/`, (req) => {
  const body = req.body as {
    topology?: unknown;
    nodes?: Node[];
    edges?: Edge[];
  };
  const next = (body.topology ?? body) as { nodes: Node[]; edges: Edge[] };
  if (Array.isArray(next.nodes))
    topology.set({ nodes: next.nodes, edges: next.edges ?? [] });
  return { success: true };
});
