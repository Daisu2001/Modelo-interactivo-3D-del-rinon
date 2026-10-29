"""Check dense path samples and particle envelopes against the original GLB lumens.
Optional authoring check: python3 tools/verify-kidney-geometry.py
Requires numpy, scipy and vtk. The application itself has no Python dependency.
"""
import hashlib, itertools, json
import numpy as np
from kidney_geometry import APP, LumenQuery

data = json.loads((APP / 'kidney-routes.json').read_text())
directions = np.array([v for v in itertools.product([-1, 0, 1], repeat=3) if any(v)], float)
directions /= np.linalg.norm(directions, axis=1)[:, None]
report = {'routeSha256': hashlib.sha256((APP / 'kidney-routes.json').read_bytes()).hexdigest(),
          'sourceHashes': data['sourceHashes'], 'sampleSpacing': .00075, 'vessels': {}}
for name, key in [('Arteria_Corte.glb', 'arterialSegments'), ('Vena_Corte.glb', 'venousSegments')]:
    query = LumenQuery(name)
    centers, envelopes = [], []
    for route in data[key]:
        points = np.array(route['points']); clearances = np.array(route['clearances'])
        for i, (a, b) in enumerate(zip(points, points[1:])):
            t = np.linspace(0, 1, max(2, int(np.ceil(np.linalg.norm(b-a) / .00075)) + 1))
            p = a[None, :] * (1-t[:, None]) + b[None, :] * t[:, None]
            # The orange sphere is largest (.75 clearance); red cells and fluid fit inside it.
            radius = (clearances[i] * (1-t) + clearances[i+1] * t) * .75
            centers.append(p)
            envelopes.append((p[:, None, :] + radius[:, None, None] * directions[None, :, :]).reshape(-1, 3))
    centers = np.concatenate(centers); envelopes = np.concatenate(envelopes)
    bad_centers = int((~query.query(centers, exact=True)).sum())
    bad_envelope = 0
    for start in range(0, len(envelopes), 100000):
        bad_envelope += int((~query.query(envelopes[start:start+100000])).sum())
    print(name, len(centers), 'path samples;', len(envelopes), 'particle-envelope samples;',
          bad_centers, 'centres outside;', bad_envelope, 'envelope points outside', flush=True)
    assert bad_centers == bad_envelope == 0, 'The actual 3D lumen does not contain the complete trajectory.'
    report['vessels'][name] = {'centerSamples': len(centers), 'envelopeSamples': len(envelopes),
                             'outsideCenters': bad_centers, 'outsideEnvelope': bad_envelope}
(APP / 'tools' / 'kidney-geometry-validation.json').write_text(json.dumps(report, indent=2) + '\n')
print('OK: paths, bends, branch connections and particle sizes remain inside the original 3D lumens.')
