"""Build calyx -> renal pelvis -> ureter paths without changing vascular routes.
Optional authoring tool; requires numpy, scipy and vtk. Run from any directory.
"""
import hashlib, itertools, json
import numpy as np
from scipy import ndimage, sparse
from scipy.sparse.csgraph import dijkstra
from scipy.spatial import cKDTree
from collecting_geometry import CollectingQuery
from kidney_geometry import APP, MODELS, vtk, vtk_to_numpy

query = CollectingQuery(); surface = query.parts[0]; step = .004
bounds = np.array(surface.GetBounds()).reshape(3, 2); origin = bounds[:, 0] - 3*step
shape = np.ceil((bounds[:, 1] - origin + 3*step) / step).astype(int) + 1
image = vtk.vtkImageData(); image.SetSpacing(step, step, step); image.SetOrigin(*origin); image.SetDimensions(*shape)
image.AllocateScalars(vtk.VTK_UNSIGNED_CHAR, 1); image.GetPointData().GetScalars().Fill(1)
stencil = vtk.vtkPolyDataToImageStencil(); stencil.SetInputData(surface)
stencil.SetOutputOrigin(*origin); stencil.SetOutputSpacing(step, step, step); stencil.SetOutputWholeExtent(image.GetExtent()); stencil.Update()
fill = vtk.vtkImageStencil(); fill.SetInputData(image); fill.SetStencilConnection(stencil.GetOutputPort()); fill.SetBackgroundValue(0); fill.Update()
mask = vtk_to_numpy(fill.GetOutput().GetPointData().GetScalars()).reshape(tuple(shape[::-1])).astype(bool)
labels, _ = ndimage.label(mask); largest = np.argmax(np.bincount(labels.ravel())[1:]) + 1; mask = labels == largest; del labels
print('Collecting lumen voxels:', mask.sum(), 'mouths:', len(query.mouths), flush=True)
distance = ndimage.distance_transform_edt(mask, sampling=step)
voxel = np.argwhere(mask); xyz = voxel[:, ::-1]*step + origin; clearance = distance[mask].astype(np.float32); del distance
lookup = np.full(mask.shape, -1, np.int32); lookup[tuple(voxel.T)] = np.arange(len(voxel), dtype=np.int32)
sources, targets, weights = [], [], []
for axis in range(3):
    delta = np.zeros(3, int); delta[axis] = 1
    neighbor = voxel + delta; valid = (neighbor < mask.shape).all(1); a = np.flatnonzero(valid)
    b = lookup[tuple(neighbor[a].T)]; valid = b >= 0; a, b = a[valid], b[valid]
    weight = step / np.minimum(clearance[a], clearance[b])**2
    sources.extend([a, b]); targets.extend([b, a]); weights.extend([weight, weight])
graph = sparse.coo_matrix((np.concatenate(weights), (np.concatenate(sources), np.concatenate(targets))), shape=(len(xyz), len(xyz))).tocsr()
del sources, targets, weights, lookup
centers = cKDTree(xyz)
def snap(mouth):
    ids = np.array(centers.query_ball_point(mouth, .03)); candidates = ids[clearance[ids] >= step*1.3]
    assert len(candidates), 'No interior voxel near the actual tube mouth'
    return int(candidates[np.argmin(np.linalg.norm(xyz[candidates] - mouth, axis=1))])
outlet_index = int(np.argmin(query.mouths[:, 1])); root = snap(query.mouths[outlet_index])
_, parent = dijkstra(graph, directed=False, indices=root, return_predecessors=True); del graph
paths, mouths = [], []
for index, mouth in enumerate(query.mouths):
    if index == outlet_index: continue
    ids = [snap(mouth)]
    while ids[-1] != root:
        assert parent[ids[-1]] >= 0, 'Calyx is disconnected from the ureter'
        ids.append(int(parent[ids[-1]]))
    paths.append(ids); mouths.append(mouth)
active = {i for path in paths for i in path}; neighbors = {i: set() for i in active}
for ids in paths:
    for a, b in zip(ids, ids[1:]): neighbors[a].add(b); neighbors[b].add(a)
points = xyz.copy(); fixed = {root, *[ids[0] for ids in paths]}
def within(samples):
    index = np.rint((samples-origin)/step).astype(int)[:, ::-1]
    valid = ((index >= 0) & (index < mask.shape)).all(1); result = np.zeros(len(samples), bool)
    result[valid] = mask[tuple(index[valid].T)]; return result
for _ in range(16):
    ids, proposals = [], []
    for i in sorted(active-fixed):
        candidate = points[i]*.35 + np.mean(points[list(neighbors[i])], axis=0)*.65
        samples = np.concatenate([np.linspace(candidate, points[j], 9) for j in neighbors[i]])
        if within(samples).all(): ids.append(i); proposals.append(candidate)
    points[ids] = proposals
edges = sorted({(min(a,b), max(a,b)) for ids in paths for a,b in zip(ids, ids[1:])})
for attempt in range(3):
    samples = np.concatenate([np.linspace(points[a], points[b], 13) for a,b in edges])
    inside, gap = query.query(samples, True)
    bad = np.flatnonzero(~inside.reshape(-1,13).all(1))
    print('Interpolated collecting samples outside:', int((~inside).sum()), '/', len(samples), flush=True)
    if not len(bad): break
    for i in bad:
        a,b = edges[i]; points[a] = xyz[a]; points[b] = xyz[b]
assert inside.all(), 'A collecting path crosses the original lumen wall'
room = {i: np.inf for i in active}
for (a,b), minimum in zip(edges, gap.reshape(-1,13).min(1)):
    safe = max(1e-7, float(minimum)-.0005); room[a] = min(room[a], safe); room[b] = min(room[b], safe)
routes = []
for ids, mouth in zip(paths, mouths):
    routes.append({'points':np.round(points[ids],7).tolist(), 'radii':np.round([room[i]*.8 for i in ids],7).tolist(),
                   'clearances':np.round([room[i] for i in ids],7).tolist(), 'entryMouth':np.round(mouth,7).tolist(),
                   'direction':'calyx-to-ureter'})
routes.sort(key=lambda route:route['points'][0][1], reverse=True)
data = {'version':1, 'coordinates':'glTF node transforms applied, before the common kidney group transform',
        'method':'Inner GLB collecting-system surface; capped actual mouths; 3D lumen geodesics with a shared outlet tree and wall-clearance checks.',
        'source':'Caliz_Corte.glb', 'sourceSha256':hashlib.sha256((MODELS/'Caliz_Corte.glb').read_bytes()).hexdigest(),
        'outletMouth':np.round(query.mouths[outlet_index],7).tolist(), 'routes':routes}
(APP/'kidney-urinary-routes.json').write_text(json.dumps(data,separators=(',',':')))
print('Saved',len(routes),'calyx-to-ureter paths; outlet',data['outletMouth'],flush=True)
