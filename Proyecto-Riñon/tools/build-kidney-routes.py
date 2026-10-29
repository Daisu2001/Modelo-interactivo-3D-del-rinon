"""Rebuild directed kidney routes from the actual 3D GLB lumens.
Run from any directory: python3 tools/build-kidney-routes.py
All volumes and intermediate graphs are temporary, outside the application.
"""
import json, itertools, hashlib, tempfile, shutil
from pathlib import Path
import numpy as np
from scipy import ndimage, sparse
from scipy.sparse.csgraph import dijkstra
from scipy.spatial import cKDTree
from kidney_geometry import APP, MODELS, mesh, voxel, LumenQuery
ROOT = Path(tempfile.mkdtemp(prefix='kidney-lumen-'))

def extract(name):
 v=np.load(ROOT/(name+'.volume.npz'));mask=v['mask'];origin=v['origin'];step=float(v['step'])
 cache=ROOT/(name+'.geodesic.npz')
 if cache.exists():
  cached=np.load(cache);xyz=cached['xyz'];r=cached['r'];parent=cached['parent'];root=int(cached['root']);depth=cached['depth']
 else:
  labels,n=ndimage.label(mask,structure=np.ones((3,3,3)));label=np.argmax(np.bincount(labels.ravel())[1:])+1;mask=labels==label;del labels
  print(name,'distance transform',mask.sum(),mask.shape,flush=True)
  clearance=ndimage.distance_transform_edt(mask,sampling=step)
  q=np.argwhere(mask).astype(np.int32);r=clearance[mask].astype(np.float32);del clearance
  xyz=q[:,::-1]*step+origin
  lookup=np.full(mask.shape,-1,np.int32);lookup[tuple(q.T)]=np.arange(len(q),dtype=np.int32)
  src=[];dst=[];weights=[]
  for delta in itertools.product([-1,0,1],repeat=3):
   if delta<=(0,0,0):continue
   nq=q+delta;valid=((nq>=0)&(nq<mask.shape)).all(1);ids=np.flatnonzero(valid);neighbor=lookup[tuple(nq[ids].T)];ok=neighbor>=0;a=ids[ok];b=neighbor[ok]
   # Strongly prefer lumen centres, while keeping every edge within the 3D mask.
   w=np.linalg.norm(delta)*step/(np.minimum(r[a],r[b])**2)
   src.extend([a,b]);dst.extend([b,a]);weights.extend([w,w])
  graph=sparse.coo_matrix((np.concatenate(weights),(np.concatenate(src),np.concatenate(dst))),shape=(len(q),len(q))).tocsr();del src,dst,weights
  # The renal arterial/venous mouth is the rightmost open trunk in model space.
  mouth=v['ends'][np.argmax(v['ends'][:,2])];candidates=np.flatnonzero(np.linalg.norm(xyz-mouth,axis=1)<.025);root=int(candidates[np.argmax(r[candidates]-.15*np.linalg.norm(xyz[candidates]-mouth,axis=1))])
  distance,parent=dijkstra(graph,directed=False,indices=root,return_predecessors=True);del graph
  depth=np.zeros(len(q));order=np.argsort(distance)
  for i in order[1:]:depth[i]=depth[parent[i]]+np.linalg.norm(xyz[i]-xyz[parent[i]])
  np.savez_compressed(cache,xyz=xyz,r=r,parent=parent,root=root,depth=depth)
 tree=cKDTree(xyz)
 # True 3D tube mouths supply terminals. A mouth buried inside another tube is
 # a junction, and is removed later if it is already covered by a distal route.
 ends=tree.query(v['ends'])[1].tolist()
 # Closed caps on the main connected mesh have no boundary ring. Recover them
 # with farthest geodesic coverage (TEASAR-style), never a planar skeleton.
 covered=np.zeros(len(xyz),bool);paths=[];endpoints=[]
 candidates=list(dict.fromkeys(ends))
 for iteration in range(400):
  if iteration<len(candidates):
   end=candidates[iteration]
  else:
   remaining=np.where(~covered,depth,-1);end=int(np.argmax(remaining))
   if remaining[end]<0:break
  ids=[end]
  while parent[ids[-1]]>=0:ids.append(int(parent[ids[-1]]))
  ids.reverse()
  # Skip small wall twigs and previously covered proximal mouths.
  uncovered=[i for i in ids if not covered[i]]
  if not uncovered:continue
  length=sum(np.linalg.norm(xyz[b]-xyz[a]) for a,b in zip(uncovered,uncovered[1:]))
  if length<.065:
   for i in uncovered:
    if covered[i]:continue
    covered[tree.query_ball_point(xyz[i],max(.025,r[i]*2.5))]=True
   continue
  paths.append(ids);endpoints.append(end)
  for i in ids:
   if covered[i]:continue
   near=tree.query_ball_point(xyz[i],max(.023,r[i]*2.5));covered[near]=True
 print(name,'paths',len(paths),'remaining',np.sum(~covered),flush=True)
 # Remove terminal paths which are entirely an ancestor of another path.
 leaves=[ids for ids in paths if not any(ids[-1] in other[:-1] for other in paths)]
 # The inlet rim is not a distal arterial branch (nor a venous tributary).
 mouth=v['ends'][np.argmax(v['ends'][:,2])]
 leaves=[ids for ids in leaves if not (depth[ids[-1]]<.25 and np.linalg.norm(xyz[ids[-1]]-mouth)<.18)]
 active=set(i for ids in leaves for i in ids);children={}
 for ids in leaves:
  for a,b in zip(ids,ids[1:]):children.setdefault(a,set()).add(b)
 # Smooth a single shared directed tree, preserving junction identity. No
 # separate glucose curve is allowed to depart from the blood path.
 smooth=xyz.copy();fixed={root,*[p[-1] for p in leaves]}
 def within(points):
  indices=np.rint((points-origin)/step).astype(int)[:,::-1]
  valid=((indices>=0)&(indices<mask.shape)).all(1);ok=np.zeros(len(points),bool);ok[valid]=mask[tuple(indices[valid].T)];return ok
 for _ in range(7):
  proposals=[];indices=[]
  for i in active-fixed:
   neighbors=[parent[i],*children.get(i,[])];candidate=.5*smooth[i]+.5*np.mean(smooth[neighbors],axis=0)
   # Only accept moves with the full incident edges inside the measured volume.
   samples=np.concatenate([np.linspace(candidate,smooth[j],9) for j in neighbors])
   if within(samples).all():indices.append(i);proposals.append(candidate)
  smooth[indices]=proposals
 # Derive actual wall clearance using the union, conservatively accounting for
 # half a voxel diagonal. Small particles and tubes adapt to this clearance.
 boundary=mask&~ndimage.binary_erosion(mask,structure=np.ones((3,3,3)))
 walltree=cKDTree(np.argwhere(boundary)[:,::-1]*step+origin)
 query=LumenQuery(name)
 active_ids=list(active);inside,exact=query.query(smooth[active_ids],True)
 print(name,'exact centres outside',np.sum(~inside),[(int(i),smooth[i].round(7).tolist(),int(parent[i]),list(children.get(i,[]))) for i in np.array(active_ids)[~inside]],flush=True)
 np.savez_compressed(ROOT/(name+'.working-tree.npz'),smooth=smooth,xyz=xyz,parent=parent,root=root,paths=np.array(leaves,dtype=object))
 if not inside.all():
  for i in np.array(active_ids)[~inside]:
   neighbors=[parent[i],*children.get(i,[])]
   neighbors=[j for j in neighbors if j>=0]
   choices=np.vstack([xyz[i],*[np.linspace(smooth[i],smooth[j],11)[1:] for j in neighbors]])
   ok,room=query.query(choices,True);ok&=room>.00015
   assert ok.any(), f'No interior correction for endpoint {i}'
   candidate=np.flatnonzero(ok)[np.argmin(np.linalg.norm(choices[ok]-smooth[i],axis=1))]
   smooth[i]=choices[candidate]
  inside,exact=query.query(smooth[active_ids],True)
  assert inside.all(), 'Centre outside exact lumen'
 # Validate complete interpolated edges. Resolve a voxel diagonal at a narrow
 # join by searching measured interior waypoints, rather than crossing its wall.
 for attempt in range(4):
  edges=[(i,j) for i,cs in children.items() for j in cs]
  samples=np.concatenate([np.linspace(smooth[i],smooth[j],13) for i,j in edges])
  contained,gaps=query.query(samples,True)
  bad_edges=np.flatnonzero(~contained.reshape(-1,13).all(1))
  print(name,'exact interpolated samples outside',np.sum(~contained),'/',len(samples),flush=True)
  if not len(bad_edges):break
  for edge in bad_edges:
   i,j=edges[edge]
   if attempt==0:
    smooth[i]=xyz[i];smooth[j]=xyz[j];continue
   A,B=smooth[i],smooth[j]
   choices=np.array([(A+B)/2+np.array([x,y,z])*size for size in [step,2*step,3*step,4*step] for x in [-1,0,1] for y in [-1,0,1] for z in [-1,0,1]])
   tests=np.array([np.vstack([np.linspace(A,c,25),np.linspace(c,B,25)]) for c in choices])
   ok,room=query.query(tests.reshape(-1,3),True);ok=ok.reshape(-1,50).all(1);minimum=room.reshape(-1,50).min(1)
   assert ok.any(), 'No connected 3D interior path through a mesh junction'
   best=np.flatnonzero(ok)[np.argmax(minimum[ok])];c=choices[best];k=len(smooth)
   smooth=np.vstack([smooth,c]);xyz=np.vstack([xyz,c]);parent=np.append(parent,i);parent[j]=k
   for ids in leaves:
    for offset in range(len(ids)-1):
     if ids[offset]==i and ids[offset+1]==j:ids.insert(offset+1,k);break
   children[i].remove(j);children[i].add(k);children[k]={j};active.add(k)
 assert contained.all(), 'A segment leaves the actual lumen'
 active_ids=list(active);inside,exact=query.query(smooth[active_ids],True)
 assert inside.all(), 'A measured junction waypoint leaves the lumen'
 radius={i:max(.0000001,float(x)-.001) for i,x in zip(active_ids,exact)}
 for (i,j),minimum in zip(edges,gaps.reshape(-1,13).min(1)):
  safe=max(.0000001,float(minimum)-.0004);radius[i]=min(radius[i],safe);radius[j]=min(radius[j],safe)
 depth={root:0.}
 for ids in leaves:
  for a,b in zip(ids,ids[1:]):depth[b]=depth[a]+np.linalg.norm(smooth[b]-smooth[a])
 segments=[]
 for start,branches in children.items():
  if start!=root and len(branches)==1:continue
  for child in sorted(branches):
   ids=[start,child]
   while len(children.get(ids[-1],[]))==1:ids.append(next(iter(children[ids[-1]])))
   segments.append(ids)
 def packed(ids):
  return {'points':np.round(smooth[ids],7).tolist(),'radii':np.round([radius[i]*.95 for i in ids],7).tolist(),'clearances':np.round([radius[i] for i in ids],7).tolist()}
 # Compare with the old projection paths before replacing them.
 old=json.loads((APP/'kidney-routes.json').read_text());oldpts=np.concatenate([np.array(s['points']) for s in old['arterialSegments' if name.startswith('Arteria') else 'venousSegments']]);print(name,'old points outside true volume',np.mean(~within(oldpts)),flush=True)
 np.savez_compressed(ROOT/(name+'.centerlines.npz'),points=smooth,paths=np.array(leaves,dtype=object),root=root,step=step,origin=origin)
 return dict(points=smooth,leaves=leaves,segments=segments,depth=depth,packed=packed,within=within,mask=mask,origin=origin,step=step)

if __name__=='__main__':
 for name in ['Arteria_Corte.glb','Vena_Corte.glb']:voxel(name,ROOT)
 a=extract('Arteria_Corte.glb');v=extract('Vena_Corte.glb')
 old=json.loads((APP/'kidney-routes.json').read_text())
 arterial=[];venous=[]
 for ids in a['segments']:
  route=a['packed'](ids);route['startDistance']=round(a['depth'][ids[0]],7);arterial.append(route)
 maximum=max(v['depth'].values())
 for ids in v['segments']:
  route=v['packed'](ids[::-1]);route['distanceFromLeafFront']=round(maximum-v['depth'][ids[-1]],7);venous.append(route)
 pos,ind,col=mesh('Caliz_Corte.glb');tri=pos[ind[(col[ind[:,0]]==[70,0,255]).all(1)]];samples=np.vstack([tri.reshape(-1,3),tri.mean(1)]);ct=cKDTree(samples)
 entries=[]
 for ids in sorted(a['leaves'],key=lambda ids:a['depth'][ids[-1]],reverse=True):
  points=a['points'][ids];depth=np.array([a['depth'][i] for i in ids]);gap,near=ct.query(points)
  candidates=np.flatnonzero(depth>=depth[-1]*.60);stop=int(candidates[np.argmin(gap[candidates])])
  if gap[stop]>.14:continue
  if any(np.linalg.norm(points[stop]-np.array(e['points'][-1]))<.075 for e in entries):continue
  route=a['packed'](ids[:stop+1]);route['entry']={'point':route['points'][-1],'nearCalyxPoint':np.round(samples[near[stop]],7).tolist(),'distanceToCalyx':round(float(gap[stop]),7),'structure':'Cálices mayores','signal':'Change model scale; no glucose is routed into the venous return.'};entries.append(route)
 entries.sort(key=lambda r:r['points'][-1][1],reverse=True)
 result={'version':3,'coordinates':old['coordinates'],'method':'3D lumen union: separate the hollow trunk inner wall at sharp rims, cap actual tube mouths, and join overlapping lumen components. Clearance-weighted 26-neighbour geodesic tree; shared centreline edges for blood and glucose, with all interpolated segments checked inside the 3D volume. No projected skeleton or depth reconstruction.','voxelSpacing':a['step'],'sources':old['sources'],'arterialSegments':arterial,'venousSegments':venous,'glucoseRoutes':entries,'drainage':old['drainage'],'sourceHashes':{name:hashlib.sha256((APP/'Models'/name).read_bytes()).hexdigest() for name in ['Arteria_Corte.glb','Vena_Corte.glb','Caliz_Corte.glb']}}
 (APP/'kidney-routes.json').write_text(json.dumps(result,separators=(',',':')))
 print('Saved version3:',len(arterial),'arterial',len(venous),'venous',len(entries),'glucose',flush=True)

if __name__ == "__main__":
 shutil.rmtree(ROOT)
