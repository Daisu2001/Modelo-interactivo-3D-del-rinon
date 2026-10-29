"""Validate the reconstructed efferent outlet portions, preserving the existing vascular-port join."""
import hashlib,importlib.util,itertools,json
from pathlib import Path
import numpy as np
spec=importlib.util.spec_from_file_location('glomerulus_builder',Path(__file__).with_name('build-glomerulus-outlets.py'));builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)
app=builder.APP;routes_file=app/'glomerulus-routes.json';routes=json.loads(routes_file.read_text());query,_=builder.efferent_query()
directions=np.array([x for x in itertools.product([-1,0,1],repeat=3) if any(x)],float);directions/=np.linalg.norm(directions,axis=1)[:,None]
centers,envelopes=[],[]
for route in routes['efferents']:
    p=np.array(route['points'][route['lumenStartIndex']:]);r=np.array(route['radii'][route['lumenStartIndex']:])
    for i,(a,b) in enumerate(zip(p,p[1:])):
        t=np.linspace(0,1,max(2,int(np.ceil(np.linalg.norm(b-a)/.0015))+1));point=a[None,:]*(1-t[:,None])+b[None,:]*t[:,None];room=r[i]*(1-t)+r[i+1]*t
        radius=np.maximum.reduce([np.minimum(.012,room*.75),np.minimum(.016,room*.6),room*.5])
        centers.append(point);envelopes.append((point[:,None,:]+radius[:,None,None]*directions[None,:,:]).reshape(-1,3))
centers=np.concatenate(centers);envelopes=np.concatenate(envelopes)
bad_center=int((~query.query(centers,exact=True)).sum());bad_envelope=0
for i in range(0,len(envelopes),50000):bad_envelope+=int((~query.query(envelopes[i:i+50000])).sum())
print('New glomerulus outlets:',len(centers),'centre samples;',len(envelopes),'envelope samples;',bad_center,'centres outside;',bad_envelope,'envelopes outside',flush=True)
assert bad_center==bad_envelope==0
report={'routeSha256':hashlib.sha256(routes_file.read_bytes()).hexdigest(),'sourceSha256':hashlib.sha256((app/'Models/Glomerulo.glb').read_bytes()).hexdigest(),'outlets':len(routes['efferents']),
        'centerSamples':len(centers),'envelopeSamples':len(envelopes),'outsideCenters':bad_center,'outsideEnvelope':bad_envelope,'scope':'Reconstructed efferent outlet portions; existing short vascular-port join retained.'}
(app/'tools/glomerulus-efferent-geometry-validation.json').write_text(json.dumps(report,indent=2)+'\n')
