"""Offline geometry tools for the textured kidney. Runtime needs only JS/JSON.
Requires Python 3, numpy, scipy and vtk (9.3 or newer).
The hollow main vessel has inner and outer skins joined by sharp rim faces.
Split those rims and cap the smaller skin to recover the actual lumen.
Other connected tube surfaces are capped separately before the 3D union.
"""
from pathlib import Path
import json, struct, heapq
import numpy as np
from scipy import ndimage
from scipy.spatial.transform import Rotation
import vtk
from vtk.util.numpy_support import numpy_to_vtk, numpy_to_vtkIdTypeArray, vtk_to_numpy
APP = Path(__file__).resolve().parents[1]
MODELS = APP / 'Models'

def mesh(name):
 b=(MODELS/name).read_bytes();n=struct.unpack_from('<I',b,12)[0];g=json.loads(b[20:20+n]);binary=b[28+n:]
 def attr(ai):
  a=g['accessors'][ai];v=g['bufferViews'][a['bufferView']];d={5121:'<u1',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']];k={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
  return np.frombuffer(binary,dtype=d,count=a['count']*k,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,k)
 pr=g['meshes'][0]['primitives'][0];pos=attr(pr['attributes']['POSITION']);ind=attr(pr['indices']).reshape(-1,3)
 node=g['nodes'][0];pos=Rotation.from_quat(node.get('rotation',[0,0,0,1])).apply(pos)+node.get('translation',[0,0,0])
 col=np.rint(attr(pr['attributes']['COLOR_0'])[:,:3]/65535*255).astype(int)
 return pos,ind,col

def poly(name):
 p,t,c=mesh(name)
 primary=[255,37,46] if name.startswith("Arteria") else [92,255,0]
 t=t[(c[t[:,0]]==primary).all(1)]
 out=vtk.vtkPolyData();points=vtk.vtkPoints();points.SetData(numpy_to_vtk(p,deep=True));out.SetPoints(points)
 cells=vtk.vtkCellArray();cells.SetCells(len(t),numpy_to_vtkIdTypeArray(np.column_stack([np.full(len(t),3),t]).ravel(),deep=True));out.SetPolys(cells)
 clean=vtk.vtkCleanPolyData();clean.SetInputData(out);clean.SetTolerance(1e-6);clean.Update();return clean.GetOutput()

def components(poly):
 c=vtk.vtkPolyDataConnectivityFilter();c.SetInputData(poly);c.SetExtractionModeToAllRegions();c.Update()
 for i in range(c.GetNumberOfExtractedRegions()):
  c.SetExtractionModeToSpecifiedRegions();c.InitializeSpecifiedRegionList();c.AddSpecifiedRegion(i);c.Update()
  clean=vtk.vtkCleanPolyData();clean.SetInputData(c.GetOutput());clean.Update()
  yield clean.GetOutput()

def close_component(p):
 f=vtk.vtkFillHolesFilter();f.SetInputData(p);f.SetHoleSize(2);f.Update()
 return f.GetOutput()

def voxel(name,output,step=.0025):
 p=poly(name);bounds=np.array(p.GetBounds()).reshape(3,2);origin=bounds[:,0]-.02;shape=np.ceil((bounds[:,1]-origin+.02)/step).astype(int)+1
 image=vtk.vtkImageData();image.SetSpacing(step,step,step);image.SetOrigin(*origin);image.SetDimensions(*shape);image.AllocateScalars(vtk.VTK_UNSIGNED_CHAR,1);image.GetPointData().GetScalars().Fill(1)
 mask=np.zeros(tuple(shape[::-1]),bool);ends=[]
 normals=vtk.vtkPolyDataNormals();normals.SetInputData(p);normals.SetFeatureAngle(55);normals.SplittingOn();normals.ConsistencyOn();normals.ComputePointNormalsOn();normals.Update()
 parts=sorted(components(normals.GetOutput()),key=lambda x:x.GetNumberOfCells(),reverse=True)
 def volume(part):
  mass=vtk.vtkMassProperties();mass.SetInputData(close_component(part));mass.Update();return mass.GetVolume()
 # Sharp rim faces join inner and outer walls in the original hollow trunk.
 # Split at those rims, cap each surface, and keep the smaller (inner) shell.
 inner=min(parts[:2],key=volume);parts=[inner]+[part for part in parts[2:] if part.GetNumberOfCells()>=100]
 for i,part in enumerate(parts):
  edge=vtk.vtkFeatureEdges();edge.SetInputData(part);edge.BoundaryEdgesOn();edge.FeatureEdgesOff();edge.NonManifoldEdgesOff();edge.ManifoldEdgesOff();edge.Update()
  # Connected boundary rings are actual tube mouths, not projected endpoints.
  boundary=[]
  for e in components(edge.GetOutput()):
   ep=vtk_to_numpy(e.GetPoints().GetData());boundary.append(np.mean(ep,axis=0));ends.append(boundary[-1])
  closed=close_component(part)
  st=vtk.vtkPolyDataToImageStencil();st.SetInputData(closed);st.SetOutputOrigin(*origin);st.SetOutputSpacing(step,step,step);st.SetOutputWholeExtent(image.GetExtent());st.Update()
  stencil=vtk.vtkImageStencil();stencil.SetInputData(image);stencil.SetStencilConnection(st.GetOutputPort());stencil.SetBackgroundValue(0);stencil.Update()
  pm=vtk_to_numpy(stencil.GetOutput().GetPointData().GetScalars()).reshape(mask.shape).astype(bool);mask|=pm
  print(name,i,'cells',part.GetNumberOfCells(),'boundary',np.round(boundary,4).tolist(),'voxels',pm.sum(),flush=True)
 labels,n=ndimage.label(mask,structure=np.ones((3,3,3)));sizes=np.bincount(labels.ravel());print('volume',mask.shape,mask.sum(),'components',n,sorted(sizes[1:],reverse=True)[:30],flush=True)
 np.savez(output/(name+'.volume.npz'),mask=mask,origin=origin,step=step,ends=ends)
 return mask,origin,step,np.array(ends)

def lumen_parts(name):
 p=poly(name);normals=vtk.vtkPolyDataNormals();normals.SetInputData(p);normals.SetFeatureAngle(55);normals.SplittingOn();normals.ConsistencyOn();normals.ComputePointNormalsOn();normals.Update()
 parts=sorted(components(normals.GetOutput()),key=lambda x:x.GetNumberOfCells(),reverse=True)
 def volume(part):
  mass=vtk.vtkMassProperties();mass.SetInputData(close_component(part));mass.Update();return mass.GetVolume()
 inner=min(parts[:2],key=volume)
 return [close_component(part) for part in [inner]+[p for p in parts[2:] if p.GetNumberOfCells()>=100]]

class LumenQuery:
 """Signed distance to consistently oriented capped lumen surfaces.
 Use local surface distance, avoiding stochastic ray tests at tiny mesh seams.
 """
 def __init__(self,name):
  self.parts=[]
  for part in lumen_parts(name):
   normals=vtk.vtkPolyDataNormals();normals.SetInputData(part);normals.SplittingOff();normals.ConsistencyOn();normals.AutoOrientNormalsOn();normals.Update()
   self.parts.append(normals.GetOutput())
 def winding(self,part,xyz):
  vertices=vtk_to_numpy(part.GetPoints().GetData());faces=vtk_to_numpy(part.GetPolys().GetData()).reshape(-1,4)[:,1:];tri=vertices[faces]
  result=[]
  for start in range(0,len(xyz),64):
   delta=tri[None,:,:,:]-xyz[start:start+64,None,None,:]
   a,b,c=delta[:,:,0],delta[:,:,1],delta[:,:,2];la,lb,lc=[np.linalg.norm(x,axis=2) for x in [a,b,c]]
   dot=lambda x,y:np.einsum('bij,bij->bi',x,y)
   numerator=dot(a,np.cross(b,c));denominator=la*lb*lc+dot(a,b)*lc+dot(b,c)*la+dot(c,a)*lb
   result.extend(np.abs(np.sum(2*np.arctan2(numerator,denominator),axis=1)/(4*np.pi))>.5)
  return np.array(result,bool)
 def query(self,xyz,clearance=False,exact=False):
  xyz=np.asarray(xyz);inside=np.zeros(len(xyz),bool);r=np.zeros(len(xyz));records=[]
  for part in self.parts:
   bounds=np.array(part.GetBounds()).reshape(3,2);ids=np.flatnonzero(((xyz>=bounds[:,0]-1e-8)&(xyz<=bounds[:,1]+1e-8)).all(1))
   if not len(ids):continue
   points=vtk.vtkPoints();points.SetData(numpy_to_vtk(xyz[ids],deep=True));cloud=vtk.vtkPolyData();cloud.SetPoints(points)
   signed=vtk.vtkImplicitPolyDataDistance();signed.SetInput(part)
   sampler=vtk.vtkSampleImplicitFunctionFilter();sampler.SetInputData(cloud);sampler.SetImplicitFunction(signed);sampler.ComputeGradientsOff();sampler.Update()
   values=vtk_to_numpy(sampler.GetOutput().GetPointData().GetArray('Implicit scalars')).copy()
   ok=values<=1e-10
   if not exact:
    inside[ids[ok]]=True
    if clearance:r[ids[ok]]=np.maximum(r[ids[ok]],np.abs(values[ok]))
   records.append((part,ids,values))
  # Resolve only the remaining ambiguous union points with generalized winding.
  # In exact mode, independently check the whole surface at every centre sample.
  for part,ids,values in records:
   test=np.arange(len(ids)) if exact else np.flatnonzero(~inside[ids])
   if not len(test):continue
   ok=self.winding(part,xyz[ids[test]]);valid=test[ok];inside[ids[valid]]=True
   if clearance:r[ids[valid]]=np.maximum(r[ids[valid]],np.abs(values[valid]))
  return (inside,r) if clearance else inside
