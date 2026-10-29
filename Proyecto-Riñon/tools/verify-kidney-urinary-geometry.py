"""Validate new urinary glucose trajectories against the original collecting GLB."""
import hashlib,itertools,json
import numpy as np
from kidney_geometry import APP, MODELS
from collecting_geometry import CollectingQuery
source=APP/'kidney-urinary-routes.json';data=json.loads(source.read_text());query=CollectingQuery()
assert data['sourceSha256']==hashlib.sha256((MODELS/data['source']).read_bytes()).hexdigest()
directions=np.array([v for v in itertools.product([-1,0,1],repeat=3) if any(v)],float);directions/=np.linalg.norm(directions,axis=1)[:,None]
centers,envelopes=[],[]
for route in data['routes']:
    p=np.array(route['points']);r=np.array(route['clearances'])
    for i,(a,b) in enumerate(zip(p,p[1:])):
        t=np.linspace(0,1,max(2,int(np.ceil(np.linalg.norm(b-a)/.00075))+1))
        point=a[None,:]*(1-t[:,None])+b[None,:]*t[:,None]
        radius=np.minimum(.005,(r[i]*(1-t)+r[i+1]*t)*.75)
        centers.append(point);envelopes.append((point[:,None,:]+radius[:,None,None]*directions[None,:,:]).reshape(-1,3))
centers=np.concatenate(centers);envelopes=np.concatenate(envelopes)
outside_centers=int((~query.query(centers,exact=True)).sum());outside_envelope=0
for i in range(0,len(envelopes),100000):outside_envelope+=int((~query.query(envelopes[i:i+100000])).sum())
print(len(centers),'centres,',len(envelopes),'particle envelope samples;',outside_centers,'centres outside;',outside_envelope,'envelope samples outside',flush=True)
assert outside_centers==outside_envelope==0,'The original collecting lumen must contain every path and particle envelope'
report={'routeSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'sourceSha256':data['sourceSha256'],'routes':len(data['routes']),
        'sampleSpacing':.00075,'centerSamples':len(centers),'envelopeSamples':len(envelopes),'outsideCenters':outside_centers,'outsideEnvelope':outside_envelope}
(APP/'tools/kidney-urinary-geometry-validation.json').write_text(json.dumps(report,indent=2)+'\n')
print('OK: glucose stays inside all seven calyx -> pelvis -> ureter paths.')
