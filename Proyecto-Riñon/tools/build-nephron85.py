"""Authoring only: numpy/scipy/VTK. Extract routes from Nefrona_fixed_2.
Mesh-local geometry is authoritative; the export node transform is ignored.
"""
from pathlib import Path
import json,struct,hashlib
import numpy as np
from scipy import ndimage,sparse
from scipy.sparse.csgraph import dijkstra,connected_components
from scipy.spatial import cKDTree
from kidney_geometry import vtk,numpy_to_vtk,numpy_to_vtkIdTypeArray,vtk_to_numpy,components,close_component,LumenQuery
APP=Path(__file__).resolve().parents[1]
SCALE=2.358

def mesh(path):
    raw=path.read_bytes();length=struct.unpack_from('<I',raw,12)[0];g=json.loads(raw[20:20+length]);binary=raw[28+length:];pr=g['meshes'][0]['primitives'][0]
    def attr(i):
        a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];typ={5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']];size={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
        x=np.frombuffer(binary,dtype=typ,count=size*a['count'],offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,size)
        return x/(255 if x.dtype==np.uint8 else 65535 if x.dtype==np.uint16 else 1) if a.get('normalized') else x
    return raw,attr(pr['attributes']['POSITION']),attr(pr['indices']).reshape(-1,3),attr,pr

def poly(p,t):
    out=vtk.vtkPolyData();points=vtk.vtkPoints();points.SetData(numpy_to_vtk(p,deep=True));out.SetPoints(points)
    cells=vtk.vtkCellArray();cells.SetCells(len(t),numpy_to_vtkIdTypeArray(np.column_stack([np.full(len(t),3),t]).ravel(),deep=True));out.SetPolys(cells)
    clean=vtk.vtkCleanPolyData();clean.SetInputData(out);clean.SetTolerance(1e-6);clean.Update();return clean.GetOutput()

def orient(part):
    n=vtk.vtkPolyDataNormals();n.SetInputData(close_component(part));n.ConsistencyOn();n.AutoOrientNormalsOn();n.SplittingOff();n.Update();return n.GetOutput()

def source_parts():
    raw,p,t,a,pr=mesh(APP/'Models/Nefrona_85.glb')
    unique,inv=np.unique(np.round(p,6),axis=0,return_inverse=True);idx=inv[t];edges=np.concatenate([idx[:,[0,1]],idx[:,[1,2]],idx[:,[2,0]]])
    graph=sparse.coo_matrix((np.ones(len(edges)),(edges[:,0],edges[:,1])),shape=(len(unique),len(unique)))
    _,labels=connected_components(graph,directed=False);labels=labels[idx[:,0]]
    parts={}
    for name,comp in [('tubular',0),('vascular',2)]:
        n=vtk.vtkPolyDataNormals();n.SetInputData(poly(p,t[labels==comp]));n.SetFeatureAngle(50);n.SplittingOn();n.ConsistencyOn();n.Update()
        skins=sorted(components(n.GetOutput()),key=lambda s:s.GetNumberOfCells(),reverse=True)
        parts[name]=skins
    return raw,p,t,labels,parts

def query_for(parts):
    q=LumenQuery.__new__(LumenQuery);q.parts=[orient(p) for p in parts];return q

def boundary(part):
    e=vtk.vtkFeatureEdges();e.SetInputData(part);e.BoundaryEdgesOn();e.FeatureEdgesOff();e.NonManifoldEdgesOff();e.ManifoldEdgesOff();e.Update()
    return np.array([vtk_to_numpy(p.GetPoints().GetData()).mean(0) for p in components(e.GetOutput())])

def voxel_graph(surface,step,bounds=None):
    bounds=np.array(surface.GetBounds()).reshape(3,2) if bounds is None else np.array(bounds)
    origin=bounds[:,0]-step*2;shape=np.ceil((bounds[:,1]-origin+step*2)/step).astype(int)+1
    image=vtk.vtkImageData();image.SetSpacing(step,step,step);image.SetOrigin(*origin);image.SetDimensions(*shape);image.AllocateScalars(vtk.VTK_UNSIGNED_CHAR,1);image.GetPointData().GetScalars().Fill(1)
    st=vtk.vtkPolyDataToImageStencil();st.SetInputData(orient(surface));st.SetOutputOrigin(*origin);st.SetOutputSpacing(step,step,step);st.SetOutputWholeExtent(image.GetExtent());st.Update()
    fill=vtk.vtkImageStencil();fill.SetInputData(image);fill.SetStencilConnection(st.GetOutputPort());fill.SetBackgroundValue(0);fill.Update()
    mask=vtk_to_numpy(fill.GetOutput().GetPointData().GetScalars()).reshape(tuple(shape[::-1])).astype(bool)
    distance=ndimage.distance_transform_edt(mask,sampling=step);vox=np.argwhere(mask);room=distance[mask];xyz=vox[:,::-1]*step+origin
    lookup=np.full(mask.shape,-1,np.int32);lookup[tuple(vox.T)]=np.arange(len(vox),dtype=np.int32)
    src,dst,weights=[],[],[]
    for axis in range(3):
        delta=np.zeros(3,int);delta[axis]=1;n=vox+delta;valid=(n<mask.shape).all(1);a=np.flatnonzero(valid);b=lookup[tuple(n[a].T)];ok=b>=0;a,b=a[ok],b[ok]
        w=step/np.minimum(room[a],room[b])**2;src.extend([a,b]);dst.extend([b,a]);weights.extend([w,w])
    graph=sparse.coo_matrix((np.concatenate(weights),(np.concatenate(src),np.concatenate(dst))),shape=(len(xyz),len(xyz))).tocsr()
    print('Lumen graph',step,len(xyz),'voxels',flush=True)
    return xyz,room,graph

def paths_from(surface,step,start,ends,bounds=None,wall=0):
    xyz,room,graph=voxel_graph(surface,step,bounds);tree=cKDTree(xyz)
    def snap(p):
        ids=tree.query_ball_point(p,max(.012,step*5));assert ids,'Missing lumen near endpoint'
        ids=np.array(ids);score=np.linalg.norm(xyz[ids]-p,axis=1)+step*step/np.maximum(room[ids],step)
        return int(ids[np.argmin(score)])
    root=snap(start);_,parents=dijkstra(graph,directed=False,indices=root,return_predecessors=True)
    q=query_for([surface]);paths=[]
    for end in ends:
        ids=[snap(end)]
        while ids[-1]!=root:
            assert parents[ids[-1]]>=0,'Disconnected lumen path';ids.append(int(parents[ids[-1]]))
        p=xyz[ids[::-1]].copy()
        for _ in range(12):
            proposed=.25*p[1:-1]+.375*(p[:-2]+p[2:]);ok=q.query(proposed);p[1:-1][ok]=proposed[ok]
        dense=np.concatenate([np.linspace(a,b,7) for a,b in zip(p,p[1:])]);inside,gap=q.query(dense,True);assert inside.all(),'Smoothed route leaves lumen'
        r=np.full(len(p),np.inf)
        for i,minimum in enumerate(gap.reshape(-1,7).min(1)):
            radius=max(.0001,float(minimum)-wall-step*.15);r[i]=min(r[i],radius);r[i+1]=min(r[i+1],radius)
        paths.append({'points':np.round(p/SCALE,9).tolist(),'radii':np.round(r/SCALE,9).tolist()})
    return paths

def tubular_radii(points,query):
    radii=np.full(len(points),np.inf)
    samples=[np.linspace(a,b,max(2,int(np.ceil(np.linalg.norm(b-a)/.001))+1)) for a,b in zip(points,points[1:])]
    inside,gap=query.query(np.concatenate(samples),True);assert inside.all(),'Tubular segment leaves the supplied mesh'
    offset=0
    for i,sample in enumerate(samples):
        minimum=gap[offset:offset+len(sample)].min();offset+=len(sample)
        radius=max(1e-7,minimum-min(.003,minimum*.3))
        radii[i]=min(radii[i],radius);radii[i+1]=min(radii[i+1],radius)
    return radii/SCALE

def build():
    raw,p,t,comp,parts=source_parts();old=json.loads((APP/'routes.json').read_text())
    vascular=parts['vascular'][0];mouths=boundary(vascular)
    inlet=mouths[np.argmin(mouths[:,2])];pole=mouths[np.argmin(mouths[:,0])]
    outlets=sorted([m for m in mouths if m[2]>-.2],key=lambda m:m[0]);assert len(outlets)==4
    vascular_paths=paths_from(vascular,.0008,pole,[inlet,*outlets])
    incoming={k:v[::-1] for k,v in vascular_paths[0].items()};outgoing=vascular_paths[1:]
    # The shortened loop is reconstructed inside its actual outer envelope;
    # clearance reserves wall thickness before sizing fluids and particles.
    proximal=np.array(old['tubule']['points'][:166])*SCALE;distal=np.array(old['tubule']['points'][191:])*SCALE
    loop=paths_from(parts['tubular'][0],.002,proximal[-1],[distal[0]],bounds=[[-.24,.08],[-.105,.03],[-.35,.27]],wall=.003)[0]
    assert np.array(loop['points'])[:,2].max()*SCALE>.2,'Loop must traverse the shortened U bend'
    tube_points=np.concatenate([proximal/SCALE,np.array(loop['points']),distal/SCALE]);tube_query=query_for([parts['tubular'][0]])
    ok,gap=tube_query.query(tube_points*SCALE,True);print('Tubular reference points outside',int((~ok).sum()),flush=True)
    assert ok.all(),'Reference route needs adapting to the delivered tubule'
    radii=tubular_radii(tube_points*SCALE,tube_query)
    lengths=np.r_[0,np.cumsum(np.linalg.norm(np.diff(tube_points,axis=0),axis=1))]
    proximal_end=lengths[165];distal_start=lengths[166+len(loop['points'])];collector_start=lengths[-2]
    # A short schematic passage within the supplied glomerular tuft.
    pole_point=incoming['points'][-1];tuft=(-.158/SCALE,-.0401/SCALE,-.3891/SCALE)
    glom={'points':[pole_point,*[(np.array(q)/SCALE).tolist() for q in [[-.153,-.0399,-.395],[-.166,-.0399,-.405],[-.172,-.0399,-.385],[-.159,-.0399,-.365],[-.146,-.0399,-.374]]],pole_point],'radii':[incoming['radii'][-1],.0015,.0015,.0015,.0015,.0015,incoming['radii'][-1]],'filterIndex':2}
    filtration={'points':[glom['points'][glom['filterIndex']],[-.1839/SCALE,-.0401/SCALE,-.3631/SCALE],[-.2146/SCALE,-.03994/SCALE,-.3608/SCALE],tube_points[0].tolist()]}
    data={'coordinateSystem':'Original glucose route frame; new asset local vertices divided by 2.358. Node export transform ignored.',
      'blood':incoming,'glomerulus':glom,'bloodOutlets':outgoing,'filtration':filtration,
      'tubule':{'points':np.round(tube_points,9).tolist(),'radii':np.round(radii,9).tolist(),'segments':[{'name':'proximal','start':0,'end':float(proximal_end)},{'name':'asa','start':float(proximal_end),'end':float(distal_start)},{'name':'distal','start':float(distal_start),'end':float(collector_start)},{'name':'colector','start':float(collector_start),'end':float(lengths[-1])}]},
      'reabsorption':{'startDistance':old['reabsorption']['startDistance'],'endDistance':old['reabsorption']['endDistance'],'outletJoinFraction':.6,'representation':'Schematic proximal-to-peritubular transfer; four measured vascular outlets.'},'assetScale':SCALE}
    (APP/'nephron85-routes.json').write_text(json.dumps(data,separators=(',',':')))
    # Transfer selection labels from the established model in the same local
    # frame; connected-component constraints handle the shortened loop/branches.
    _,po,to,ao,pro=mesh(APP/'Models/Nefrona_anatomia.glb');fo=np.rint(ao(pro['attributes']['COLOR_0'])[:,:3]*255).astype(int)[to[:,0]]
    locator=vtk.vtkStaticCellLocator();locator.SetDataSet(poly(po,to));locator.BuildLocator();labels=[]
    for xyz in p[t].mean(1):
        closest=[0.,0.,0.];cell=vtk.reference(0);sub=vtk.reference(0);distance=vtk.reference(0.);locator.FindClosestPoint(xyz,closest,cell,sub,distance);labels.append(fo[int(cell)])
    labels=np.array(labels);centers=p[t].mean(1)
    vascular_mask=comp==2;inlet_mask=(labels==[76,188,125]).all(1);tuft_mask=(labels==[188,54,49]).all(1)
    labels[vascular_mask&~inlet_mask&~tuft_mask]=[78,54,1]
    labels[vascular_mask&~inlet_mask&~tuft_mask&(centers[:,2]>-.285)]=[19,24,1]
    labels[(comp==0)&(centers[:,0]<.06)&(centers[:,2]>-.26)&~(labels==[119,188,24]).all(1)]=[119,79,130]
    labels[comp==1]=[188,54,49]
    keys=sorted(set(','.join(map(str,c)) for c in labels));groups=[{'key':key,'triangles':np.flatnonzero((labels==list(map(int,key.split(',')))).all(1)).tolist()} for key in keys]
    report={'source':'Nefrona_fixed_2.glb','sourceSha256':hashlib.sha256(raw).hexdigest(),'vertices':len(p),'triangles':len(t),'assetScale':SCALE,'regionSource':'Surface correspondence to Nefrona_anatomia.glb, constrained by connected vascular/tubular components for the shortened geometry.','groups':groups,'outlets':4}
    (APP/'nephron85-regions.json').write_text(json.dumps(report,separators=(',',':')))
    print('Saved textured nephron, regions and measured routes',flush=True)
if __name__=='__main__':build()
