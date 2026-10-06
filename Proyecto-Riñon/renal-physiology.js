// Educational aggregate renal model, using the four equations displayed in the UI.
// It does not assign whole-kidney mL/min to the dimensions of a single GLB.
export const DEFAULT_RENAL = Object.freeze({
  pglu: 100, tfg: 125, tmg: 205, pgc: 60, pbs: 18, pigc: 32, pibs: 0, linkStarling: true
});
export function calculateRenalState(input = {}) {
  const p = { ...DEFAULT_RENAL, ...input };
  for (const key of ['pglu', 'tfg', 'tmg', 'pgc', 'pbs', 'pigc', 'pibs']) {
    if (!Number.isFinite(p[key])) throw new Error('Parámetro renal inválido: ' + key);
  }
  const pfn = (p.pgc - p.pbs) - (p.pigc - p.pibs);
  const starlingTfg = Math.max(0, 12.5 * pfn);
  const tfg = p.linkStarling ? starlingTfg : Math.max(0, p.tfg);
  const filtered = tfg * Math.max(0, p.pglu) / 100;
  const reabsorbed = Math.min(filtered, Math.max(0, p.tmg));
  const excreted = Math.max(0, filtered - reabsorbed);
  const fractionExcreted = filtered > 0 ? excreted / filtered : 0;
  const pressureState = pfn <= 0 ? 'Cese de filtración' : pfn < 8 ? 'Hipofiltración'
    : pfn <= 12 ? 'Filtración normal' : 'Hiperfiltración';
  const filtrationState = p.linkStarling ? pressureState : tfg <= 0 ? 'Cese de filtración'
    : tfg < 100 ? 'Filtración baja' : tfg <= 150 ? 'Filtración normal' : 'Filtración elevada';
  const glucoseState = filtered === 0 ? 'Sin glucosa filtrada'
    : excreted > 0 ? 'Glucosuria' : 'Reabsorción completa';
  return Object.freeze({ ...p, tfg, pfn, starlingTfg, filtered, reabsorbed, excreted,
    fractionExcreted, reabsorptionFraction: filtered > 0 ? reabsorbed / filtered : 1,
    filtrationProbability: Math.min(1, tfg / 625),
    // Rate * filtrationProbability = filtered / 100 visual particles per second.
    inletRate: 6.25 * Math.max(0, p.pglu) / 100,
    filtrateSpeed: tfg > 0 ? .38 * tfg / 125 : 0,
    filtrationState, pressureState, glucoseState });
}
