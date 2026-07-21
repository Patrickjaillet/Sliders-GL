#!/usr/bin/env python3
"""
Blender to Z-GL Scene Exporter
Exports Blender scenes to Z-GL scene format (.zgl-scene)
"""

import bpy
import json
import math
import os
from datetime import datetime
from typing import Any, Dict, List, Optional

SCENE_FILE_VERSION = "1.0"
SCENE_FILE_FORMAT  = "zgl-scene"

NODE_TYPE_MAP = {
    "EMPTY":  "group",
    "MESH":   "mesh",
    "LIGHT":  "light",
    "CAMERA": "camera",
}

LIGHT_TYPE_MAP = {
    "POINT": "point",
    "SUN":   "directional",
    "SPOT":  "spot",
    "AREA":  "area",
}


def vec3(v) -> List[float]:
    return [v.x, v.y, v.z]


def euler(e) -> List[float]:
    return [e.x, e.y, e.z]


def color3(c) -> List[float]:
    return [c.r, c.g, c.b]


def mesh_aabb(obj) -> Dict[str, List[float]]:
    world_corners = [obj.matrix_world @ v.co for v in obj.data.vertices]
    if not world_corners:
        return {"min": [-0.5, -0.5, -0.5], "max": [0.5, 0.5, 0.5]}
    xs = [c.x for c in world_corners]
    ys = [c.y for c in world_corners]
    zs = [c.z for c in world_corners]
    return {"min": [min(xs), min(ys), min(zs)], "max": [max(xs), max(ys), max(zs)]}


def export_mesh(obj) -> Dict[str, Any]:
    mesh = obj.data
    mesh.calc_loop_triangles()
    verts  = [[v.co.x, v.co.y, v.co.z] for v in mesh.vertices]
    faces  = [[t.vertices[0], t.vertices[1], t.vertices[2]] for t in mesh.loop_triangles]
    norms  = [[v.normal.x, v.normal.y, v.normal.z] for v in mesh.vertices]
    uvs: List[List[float]] = []
    if mesh.uv_layers.active:
        ul = mesh.uv_layers.active
        uvs = [[ul.data[lp.index].uv.x, ul.data[lp.index].uv.y] for lp in mesh.loops]
    aabb = mesh_aabb(obj)
    return {"vertices": verts, "faces": faces, "normals": norms, "uvs": uvs, "aabb": aabb}


def export_light(obj) -> Dict[str, Any]:
    light = obj.data
    d: Dict[str, Any] = {
        "lightType":  LIGHT_TYPE_MAP.get(light.type, "point"),
        "color":      color3(light.color),
        "intensity":  light.energy,
        "castShadow": False,
    }
    if light.type == "POINT":
        d["range"] = light.cutoff_distance if light.cutoff_distance > 0 else 0
    elif light.type == "SPOT":
        d["angle"]    = math.degrees(light.spot_size)
        d["penumbra"] = light.spot_blend
    elif light.type == "AREA":
        d["size"] = light.size
    return d


def export_camera(obj) -> Dict[str, Any]:
    cam = obj.data
    scene = bpy.context.scene
    aspect = scene.render.resolution_x / max(scene.render.resolution_y, 1)
    d: Dict[str, Any] = {
        "near":           cam.clip_start,
        "far":            cam.clip_end,
        "aspect":         aspect,
        "isOrthographic": cam.type == "ORTHO",
    }
    if cam.type == "PERSP":
        d["fov"] = math.degrees(cam.angle)
    else:
        d["fov"]       = 75
        d["orthoSize"] = cam.ortho_scale
    return d


def export_node(obj) -> Dict[str, Any]:
    node_type = NODE_TYPE_MAP.get(obj.type, "transform")
    node: Dict[str, Any] = {
        "id":       f"node_{obj.name}_{id(obj)}",
        "type":     node_type,
        "name":     obj.name,
        "visible":  not obj.hide_render,
        "position": vec3(obj.location),
        "rotation": euler(obj.rotation_euler),
        "scale":    vec3(obj.scale),
        "skew":     [0, 0, 0],
        "userData": {},
        "children": [],
    }
    if obj.type == "MESH":
        node["userData"]["meshData"] = export_mesh(obj)
    elif obj.type == "LIGHT":
        node["userData"]["lightData"] = export_light(obj)
    elif obj.type == "CAMERA":
        node["userData"]["cameraData"] = export_camera(obj)
    return node


def build_hierarchy(objects) -> Dict[str, Any]:
    obj_map: Dict[str, Dict[str, Any]] = {}
    for obj in objects:
        if obj.name not in obj_map:
            obj_map[obj.name] = export_node(obj)

    roots: List[Dict[str, Any]] = []
    for obj in objects:
        node = obj_map[obj.name]
        if obj.parent and obj.parent.name in obj_map:
            obj_map[obj.parent.name]["children"].append(node)
        else:
            roots.append(node)

    if len(roots) == 1:
        return roots[0]
    return {
        "id":       "node_root",
        "type":     "group",
        "name":     "Root",
        "visible":  True,
        "position": [0, 0, 0],
        "rotation": [0, 0, 0],
        "scale":    [1, 1, 1],
        "skew":     [0, 0, 0],
        "userData": {},
        "children": roots,
    }


def extract_uniforms(scene) -> Dict[str, float]:
    uniforms: Dict[str, float] = {}
    for obj in scene.objects:
        for key in obj.keys():
            if key.startswith("_"):
                continue
            try:
                val = obj[key]
                if isinstance(val, (int, float)):
                    uniforms[f"{obj.name}_{key}"] = float(val)
            except Exception:
                pass
    return uniforms


def export_scene(filepath: str) -> None:
    scene = bpy.context.scene
    objects = [o for o in scene.objects if o.type in ("EMPTY", "MESH", "LIGHT", "CAMERA")]
    root    = build_hierarchy(objects)
    data    = {
        "version":   SCENE_FILE_VERSION,
        "format":    SCENE_FILE_FORMAT,
        "timestamp": datetime.now().isoformat(),
        "scene": {
            "root":     root,
            "uniforms": extract_uniforms(scene),
        },
    }
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"[Z-GL] Exported to {filepath} ({len(objects)} objects)")


def export_menu_func(self, context):
    default = os.path.splitext(bpy.data.filepath)[0] + ".zgl-scene" if bpy.data.filepath else "scene.zgl-scene"
    self.layout.operator("export_scene.zgl_scene", text="Z-GL Scene (.zgl-scene)").filepath = default


class ExportZGLScene(bpy.types.Operator):
    """Export current scene to Z-GL format"""
    bl_idname  = "export_scene.zgl_scene"
    bl_label   = "Export Z-GL Scene"
    bl_options = {"REGISTER"}

    filepath: bpy.props.StringProperty(
        name="File Path",
        description="Destination .zgl-scene file",
        default="",
        subtype="FILE_PATH",
    )

    def execute(self, context):
        export_scene(self.filepath)
        return {"FINISHED"}

    def invoke(self, context, event):
        if not self.filepath:
            base = os.path.splitext(bpy.data.filepath)[0] if bpy.data.filepath else "scene"
            self.filepath = base + ".zgl-scene"
        context.window_manager.fileselect_add(self)
        return {"RUNNING_MODAL"}


def register():
    bpy.utils.register_class(ExportZGLScene)
    bpy.types.TOPBAR_MT_file_export.append(export_menu_func)


def unregister():
    bpy.types.TOPBAR_MT_file_export.remove(export_menu_func)
    bpy.utils.unregister_class(ExportZGLScene)


if __name__ == "__main__":
    register()
