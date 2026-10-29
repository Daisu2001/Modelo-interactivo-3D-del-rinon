"""Authoring helpers for the GLB collecting-system lumen, in original model units."""
import numpy as np
from kidney_geometry import *

def collecting_surface():
    position, triangles, _ = mesh('Caliz_Corte.glb')
    poly = vtk.vtkPolyData(); points = vtk.vtkPoints()
    points.SetData(numpy_to_vtk(position, deep=True)); poly.SetPoints(points)
    cells = vtk.vtkCellArray()
    cells.SetCells(len(triangles), numpy_to_vtkIdTypeArray(np.column_stack([np.full(len(triangles), 3), triangles]).ravel(), deep=True))
    poly.SetPolys(cells)
    clean = vtk.vtkCleanPolyData(); clean.SetInputData(poly); clean.SetTolerance(1e-6); clean.Update()
    # Rounded rim bevels on this particular GLB require 45 degrees; vascular
    # parts have different rims and retain their existing 55-degree extraction.
    normals = vtk.vtkPolyDataNormals(); normals.SetInputData(clean.GetOutput())
    normals.SetFeatureAngle(45); normals.SplittingOn(); normals.ConsistencyOn(); normals.Update()
    skins = sorted(components(normals.GetOutput()), key=lambda part: part.GetNumberOfCells(), reverse=True)[:2]
    def volume(part):
        mass = vtk.vtkMassProperties(); mass.SetInputData(close_component(part)); mass.Update(); return mass.GetVolume()
    inner = min(skins, key=volume)
    edges = vtk.vtkFeatureEdges(); edges.SetInputData(inner); edges.BoundaryEdgesOn()
    edges.FeatureEdgesOff(); edges.NonManifoldEdgesOff(); edges.ManifoldEdgesOff(); edges.Update()
    mouths = np.array([vtk_to_numpy(part.GetPoints().GetData()).mean(0) for part in components(edges.GetOutput())])
    return close_component(inner), mouths

class CollectingQuery(LumenQuery):
    def __init__(self):
        part, self.mouths = collecting_surface()
        normals = vtk.vtkPolyDataNormals(); normals.SetInputData(part); normals.SplittingOff()
        normals.ConsistencyOn(); normals.AutoOrientNormalsOn(); normals.Update()
        self.parts = [normals.GetOutput()]
