export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface FileNode {
  path: string;
  name: string;
  size_bytes: number;
  is_directory: boolean;
  modified_at?: number;
  extension?: string;
  is_system?: boolean;
  children?: FileNode[];
  item_count?: number;
}

export interface LayoutNode {
  path: string;
  name: string;
  size_bytes: number;
  is_directory: boolean;
  children?: LayoutNode[];
  extension?: string;
  is_system?: boolean;
}

export interface TreemapRect {
  path: string;
  name: string;
  rect: Rect;
  size_bytes: number;
  depth: number;
  is_directory: boolean;
  extension?: string;
  is_system?: boolean;
}

export interface SunburstArc {
  path: string;
  name: string;
  center: Point;
  r_inner: number;
  r_outer: number;
  start_angle: number;
  end_angle: number;
  depth: number;
  size_bytes: number;
  is_directory: boolean;
}
