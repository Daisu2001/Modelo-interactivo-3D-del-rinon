"""Validate source-space paths and moving envelopes against the delivered mesh."""
import hashlib,importlib.util,itertools,json
from pathlib import Path
import numpy as np
spec=importlib.util.spec_from_file_location('builder',Path(__file__).with_name('build-nephron85.py'));b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
raw,p,t,comp,parts=b.source_parts();file=b.APP/'nephron85-routes.json';data=json.loads(file.read_text())
directions=np.array([x for x in itertools.product([-1,0,1],repeat=3) if any(x)],float);directions/=np.linalg.norm(directions,axis=1)[:,None]
records=[]
for name,routes,query,step in [('vascular',[data['blood'],*data['bloodOutlets']],b.query_for([parts['vascular'][0]]),.0005),
                              ('tubular',[data['tubule']],b.query_for([parts['tubular'][0]]),.001)]:
    centers,envelopes=[],[]
    for route_index,route in enumerate(routes):
        points=np.array(route['points'])*b.SCALE;radii=np.array(route['radii'])*b.SCALE
        distances=np.r_[0,np.cumsum(np.linalg.norm(np.diff(points,axis=0),axis=1))]
        for i,(a,c) in enumerate(zip(points,points[1:])):
            ts=np.linspace(0,1,max(2,int(np.ceil(np.linalg.norm(c-a)/step))+1))
            center=a[None,:]*(1-ts[:,None])+c[None,:]*ts[:,None]
            if name=='vascular' and route_index>0:
                u=(distances[i]+ts*(distances[i+1]-distances[i]))/distances[-1]
                fade=np.clip((u-.98)/.02,0,1);fraction=.78-.13*fade*fade*(3-2*fade)
            else:fraction=.65
            radius=(radii[i]*(1-ts)+radii[i+1]*ts)*fraction
            centers.append(center);envelopes.append((center[:,None,:]+radius[:,None,None]*directions[None,:,:]).reshape(-1,3))
    centers=np.concatenate(centers);envelopes=np.concatenate(envelopes)
    ok=query.query(centers,exact=True);bad_center=int((~ok).sum());bad_envelope=0
    for i in range(0,len(envelopes),50000):bad_envelope+=int((~query.query(envelopes[i:i+50000])).sum())
    print(name,len(centers),'centers',len(envelopes),'envelopes; outside',bad_center,bad_envelope,flush=True)
    if bad_center:print('Outside centers:',centers[~ok][:15].tolist(),flush=True)
    assert bad_center==bad_envelope==0
    records.append({'name':name,'radiusFraction':.78 if name=='vascular' else .65,'centerSamples':len(centers),'envelopeSamples':len(envelopes),'outsideCenters':bad_center,'outsideEnvelope':bad_envelope})
report={'sourceSha256':hashlib.sha256(raw).hexdigest(),'routesSha256':hashlib.sha256(file.read_bytes()).hexdigest(),
        'records':records,'outlets':4,'scope':'Vascular inner lumen; tubular outer envelope with reserved wall clearance. Glomerular and proximal-to-peritubular connections are schematic.'}
(b.APP/'tools/nephron85-geometry-validation.json').write_text(json.dumps(report,indent=2)+'\n')
