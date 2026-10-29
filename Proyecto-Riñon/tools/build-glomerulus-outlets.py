"""Extract the new textured glomerulus efferent outlet paths from its actual 3D lumen.
Optional authoring tool: numpy, scipy and vtk; not needed to run the Atlas.
"""
from pathlib import Path
import hashlib,json,struct
import numpy as np
from scipy import ndimage,sparse
from scipy.sparse.csgraph import dijkstra
from scipy.spatial import cKDTree
from kidney_geometry import vtk,numpy_to_vtk,numpy_to_vtkIdTypeArray,vtk_to_numpy,components,close_component,LumenQuery
APP=Path(__file__).resolve().parents[1]
ORIGIN=np.array([-.27604222297668457,-.031138598918914795,.05575452744960785])

def source_mesh():
    raw=(APP/'Models/Glomerulo.glb').read_bytes();length=struct.unpack_from('<I',raw,12)[0]
    gltf=json.loads(raw[20:20+length]);binary=raw[28+length:];primitive=gltf['meshes'][0]['primitives'][0]
    def attribute(index):
        a=gltf['accessors'][index];v=gltf['bufferViews'][a['bufferView']]
        dtype={5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']]
        size={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
        return np.frombuffer(binary,dtype=dtype,count=a['count']*size,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,size)
    points=attribute(primitive['attributes']['POSITION'])+ORIGIN
    triangles=attribute(primitive['indices']).reshape(-1,3)
    colors=attribute(primitive['attributes']['COLOR_1']);maximum=65535 if colors.dtype==np.uint16 else 255 if colors.dtype==np.uint8 else 1
    colors=np.rint(colors[:,:3]/maximum*255).astype(int)
    return raw,points,triangles,colors

def efferent_query():
    raw,p,t,c=source_mesh();face=c[t[:,0]]
    t=t[(face==[80,0,84]).all(1)|(face==[237,181,130]).all(1)]
    poly=vtk.vtkPolyData();points=vtk.vtkPoints();points.SetData(numpy_to_vtk(p,deep=True));poly.SetPoints(points)
    cells=vtk.vtkCellArray();cells.SetCells(len(t),numpy_to_vtkIdTypeArray(np.column_stack([np.full(len(t),3),t]).ravel(),deep=True));poly.SetPolys(cells)
    clean=vtk.vtkCleanPolyData();clean.SetInputData(poly);clean.SetTolerance(1e-6);clean.Update()
    normals=vtk.vtkPolyDataNormals();normals.SetInputData(clean.GetOutput());normals.SetFeatureAngle(55);normals.SplittingOn();normals.ConsistencyOn();normals.Update()
    skins=sorted(components(normals.GetOutput()),key=lambda part:part.GetNumberOfCells(),reverse=True)[:2]
    def orient(part):
        n=vtk.vtkPolyDataNormals();n.SetInputData(close_component(part));n.ConsistencyOn();n.AutoOrientNormalsOn();n.SplittingOff();n.Update();return n.GetOutput()
    def volume(part):
        m=vtk.vtkMassProperties();m.SetInputData(orient(part));m.Update();return m.GetVolume()
    inner=min(skins,key=volume)
    edges=vtk.vtkFeatureEdges();edges.SetInputData(inner);edges.BoundaryEdgesOn();edges.FeatureEdgesOff();edges.NonManifoldEdgesOff();edges.ManifoldEdgesOff();edges.Update()
    mouths=np.array([vtk_to_numpy(part.GetPoints().GetData()).mean(0) for part in components(edges.GetOutput())])
    query=LumenQuery.__new__(LumenQuery);query.parts=[orient(inner)]
    return query,mouths

def build():
    routes=json.loads((APP/'glomerulus-routes.json').read_text());query,mouths=efferent_query();surface=query.parts[0];step=.005
    bounds=np.array(surface.GetBounds()).reshape(3,2);origin=bounds[:,0]-step*3;shape=np.ceil((bounds[:,1]-origin+3*step)/step).astype(int)+1
    image=vtk.vtkImageData();image.SetSpacing(step,step,step);image.SetOrigin(*origin);image.SetDimensions(*shape);image.AllocateScalars(vtk.VTK_UNSIGNED_CHAR,1);image.GetPointData().GetScalars().Fill(1)
    stencil=vtk.vtkPolyDataToImageStencil();stencil.SetInputData(surface);stencil.SetOutputOrigin(*origin);stencil.SetOutputSpacing(step,step,step);stencil.SetOutputWholeExtent(image.GetExtent());stencil.Update()
    fill=vtk.vtkImageStencil();fill.SetInputData(image);fill.SetStencilConnection(stencil.GetOutputPort());fill.SetBackgroundValue(0);fill.Update()
    mask=vtk_to_numpy(fill.GetOutput().GetPointData().GetScalars()).reshape(tuple(shape[::-1])).astype(bool)
    labels,_=ndimage.label(mask);label=np.argmax(np.bincount(labels.ravel())[1:])+1;mask=labels==label;del labels
    distance=ndimage.distance_transform_edt(mask,sampling=step);voxel=np.argwhere(mask);radius=distance[mask];xyz=voxel[:,::-1]*step+origin;del distance
    print('Afferent 3D lumen voxels',len(xyz),flush=True)
    lookup=np.full(mask.shape,-1,np.int32);lookup[tuple(voxel.T)]=np.arange(len(xyz),dtype=np.int32)
    src,dst,weights=[],[],[]
    for axis in range(3):
        delta=np.zeros(3,int);delta[axis]=1;n=voxel+delta;valid=(n<mask.shape).all(1);a=np.flatnonzero(valid);b=lookup[tuple(n[a].T)];ok=b>=0;a,b=a[ok],b[ok]
        w=step/np.minimum(radius[a],radius[b])**2;src.extend([a,b]);dst.extend([b,a]);weights.extend([w,w])
    graph=sparse.coo_matrix((np.concatenate(weights),(np.concatenate(src),np.concatenate(dst))),shape=(len(xyz),len(xyz))).tocsr()
    tree=cKDTree(xyz)
    def snap(point,margin=.0):
        ids=np.array(tree.query_ball_point(point,.06));ids=ids[radius[ids]>=margin]
        assert len(ids),'No interior voxel near inlet'
        return int(ids[np.argmin(np.linalg.norm(xyz[ids]-point,axis=1))])
    # The terminal join inside the capillary network remains the existing join.
    old_join=routes['preservedEfferentJoin'][::-1]
    root=snap(np.array(old_join[0]));_,parent=dijkstra(graph,directed=False,indices=root,return_predecessors=True)
    inlets=sorted((mouth for mouth in mouths if mouth[0]>.5),key=lambda p:(p[1],p[2]))
    assert len(inlets)==4,'The delivered model has four true efferent outlet mouths'
    paths=[]
    for mouth in inlets:
        ids=[snap(mouth,.02)]
        while ids[-1]!=root:
            assert parent[ids[-1]]>=0,'Afferent outlet is disconnected';ids.append(int(parent[ids[-1]]))
        paths.append(ids)
    active={i for ids in paths for i in ids};neighbors={i:set() for i in active}
    for ids in paths:
        for a,b in zip(ids,ids[1:]):neighbors[a].add(b);neighbors[b].add(a)
    points=xyz.copy();fixed={root,*[ids[0] for ids in paths]}
    def inside_mask(p):
        q=np.rint((p-origin)/step).astype(int)[:,::-1];valid=((q>=0)&(q<mask.shape)).all(1);ok=np.zeros(len(p),bool);ok[valid]=mask[tuple(q[valid].T)];return ok
    for _ in range(18):
        ids,proposals=[],[]
        for i in sorted(active-fixed):
            candidate=.35*points[i]+.65*np.mean(points[list(neighbors[i])],axis=0)
            if inside_mask(np.concatenate([np.linspace(candidate,points[j],9) for j in neighbors[i]])).all():ids.append(i);proposals.append(candidate)
        points[ids]=proposals
    # Use the exact existing junction centre when it is inside the new lumen.
    if query.query(np.array([old_join[0]]))[0]:points[root]=old_join[0]
    edges=sorted({(min(a,b),max(a,b)) for ids in paths for a,b in zip(ids,ids[1:])})
    for _ in range(3):
        sample=np.concatenate([np.linspace(points[a],points[b],13) for a,b in edges]);ok,gap=query.query(sample,True);bad=np.flatnonzero(~ok.reshape(-1,13).all(1))
        print('Afferent segment samples outside',int((~ok).sum()),'/',len(sample),flush=True)
        if not len(bad):break
        for i in bad:
            a,b=edges[i];points[a]=xyz[a];points[b]=xyz[b]
    assert ok.all(),'Afferent route leaves its source geometry'
    room={i:np.inf for i in active}
    for (a,b),minimum in zip(edges,gap.reshape(-1,13).min(1)):
        r=max(1e-6,float(minimum)-.001);room[a]=min(room[a],r);room[b]=min(room[b],r)
    incoming=[]
    for ids,mouth in zip(paths,inlets):
        p=np.round(points[ids],7).tolist();r=np.round([room[i] for i in ids],7).tolist()
        p.append(old_join[-1]);r.append(routes['efferent']['radii'][0])
        incoming.append({'points':p[::-1],'radii':r[::-1],'lumenStartIndex':1,'outletMouth':np.round(mouth,7).tolist()})
    routes['preservedEfferentJoin']=old_join[::-1];routes['efferents']=incoming;routes['efferent']=incoming[0]
    routes['source']='Glomerulo_fixed_2.glb: COLOR_1 anatomical regions; textured merged mesh aligned to Atlas coordinates; single afferent inlet, four outward efferent lumen paths; existing capillary, proximal and junction paths retained.'
    (APP/'glomerulus-routes.json').write_text(json.dumps(routes,separators=(',',':')))
    raw,p,t,c=source_mesh();palette,counts=np.unique(c[t[:,0]],axis=0,return_counts=True)
    metadata={'source':'Glomerulo_fixed_2.glb','sourceSha256':hashlib.sha256(raw).hexdigest(),'triangles':len(t),'vertices':len(p),'regionAttribute':'color_1','modelOrigin':ORIGIN.tolist(),
              'regionTriangles':{','.join(map(str,col)):int(count) for col,count in zip(palette,counts)},'afferentInlets':1,'efferentOutlets':4,'efferentSampleSpacing':step}
    (APP/'glomerulus-asset.json').write_text(json.dumps(metadata,indent=2)+'\n')
    print('Saved four outlet paths; minimum radius',min(min(x['radii']) for x in incoming),flush=True)
if __name__=='__main__':build()
