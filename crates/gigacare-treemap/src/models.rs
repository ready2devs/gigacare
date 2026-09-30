use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LayoutNode {
    pub path: String,
    pub name: String,
    pub size_bytes: u64,
    pub is_directory: bool,
    #[serde(default)]
    pub children: Vec<LayoutNode>,
    #[serde(default)]
    pub extension: Option<String>,
    #[serde(default)]
    pub is_system: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TreemapRect {
    pub path: String,
    pub name: String,
    pub rect: Rect,
    pub size_bytes: u64,
    pub depth: u32,
    pub is_directory: bool,
    pub extension: Option<String>,
    pub is_system: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SunburstArc {
    pub path: String,
    pub name: String,
    pub center: Point,
    pub r_inner: f64,
    pub r_outer: f64,
    pub start_angle: f64, // radians
    pub end_angle: f64,
    pub depth: u32,
    pub size_bytes: u64,
    pub is_directory: bool,
}
