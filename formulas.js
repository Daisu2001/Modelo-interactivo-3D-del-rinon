/**
 * ====================================================================
 * MÓDULO DE FÓRMULAS FISIOLÓGICAS RENALES (formulas.js)
 * ====================================================================
 * Contiene toda la lógica matemática y los controladores de eventos
 * para:
 *   1. Cinética y transporte tubular de Glucosa (SGLT2 / TmG)
 *   2. Fuerzas de Starling y TFG neta
 */

export function initFormulas() {
  const anatomyView = document.querySelector('#anatomy-view');
  const formulasView = document.querySelector('#formulas-view');
  const structureTitle = document.querySelector('#structure-title');
  const glucoseContent = document.querySelector('#glucose-content');
  const filtrationContent = document.querySelector('#filtration-content');
  const btnSubtabGlucose = document.querySelector('#btn-subtab-glucose');
  const btnSubtabFiltration = document.querySelector('#btn-subtab-filtration');

  // Control de sub-pestañas dentro de la sección de fórmulas
  function setFormulaSubtab(type) {
    if (type === 'glucose') {
      btnSubtabGlucose?.classList.add('active');
      btnSubtabFiltration?.classList.remove('active');
      if (glucoseContent) glucoseContent.style.display = 'block';
      if (filtrationContent) filtrationContent.style.display = 'none';
      if (structureTitle) structureTitle.innerText = 'Fisiología de la Glucosa';
    } else {
      btnSubtabGlucose?.classList.remove('active');
      btnSubtabFiltration?.classList.add('active');
      if (glucoseContent) glucoseContent.style.display = 'none';
      if (filtrationContent) filtrationContent.style.display = 'block';
      if (structureTitle) structureTitle.innerText = 'Filtración Glomerular (Starling)';
    }
  }

  btnSubtabGlucose?.addEventListener('click', () => setFormulaSubtab('glucose'));
  btnSubtabFiltration?.addEventListener('click', () => setFormulaSubtab('filtration'));

  // ------------------------------------------------------------------
  // 1. CÁLCULOS DE TRANSPORTE TUBULAR DE GLUCOSA
  // ------------------------------------------------------------------
  const sliderPglu = document.querySelector('#slider-pglu');
  const sliderTfg = document.querySelector('#slider-tfg');
  const sliderTmg = document.querySelector('#slider-tmg');
  const valPglu = document.querySelector('#val-pglu');
  const valTfg = document.querySelector('#val-tfg');
  const valTmg = document.querySelector('#val-tmg');
  const resFl = document.querySelector('#res-fl');
  const resReab = document.querySelector('#res-reab');
  const resExc = document.querySelector('#res-exc');
  const resFe = document.querySelector('#res-fe');
  const fillSglt2 = document.querySelector('#fill-sglt2');
  const fillSglt1 = document.querySelector('#fill-sglt1');
  const pctSglt2 = document.querySelector('#pct-sglt2');
  const pctSglt1 = document.querySelector('#pct-sglt1');
  const glucoseClinicalState = document.querySelector('#glucose-clinical-state');
  const glucoseStatusTag = document.querySelector('#glucose-status-tag');
  const glucoseStatusText = document.querySelector('#glucose-status-text');

  function calculateGlucoseFormulas() {
    if (!sliderPglu || !sliderTfg || !sliderTmg) return;

    const pglu = parseFloat(sliderPglu.value);   // mg/dL
    const tfg = parseFloat(sliderTfg.value);     // mL/min
    const tmg = parseFloat(sliderTmg.value);     // mg/min (Transporte Máximo)

    // Carga Filtrada: FL = (P_glu * TFG) / 100
    const cargaFiltrada = (pglu * tfg) / 100;

    // Umbral renal real con fenómeno de splay (~180 mg/dL a TFG 125 mL/min)
    const thresholdFraction = 0.72;
    const splayStart = tmg * thresholdFraction;

    let reabsorcion = 0;
    if (cargaFiltrada <= splayStart) {
      reabsorcion = cargaFiltrada;
    } else if (cargaFiltrada < tmg) {
      const delta = cargaFiltrada - splayStart;
      const range = tmg - splayStart;
      const curve = Math.sin((delta / range) * (Math.PI / 2));
      reabsorcion = splayStart + curve * range;
    } else {
      reabsorcion = tmg;
    }

    // Excreción: E = FL - R
    const excrecion = Math.max(0, cargaFiltrada - reabsorcion);

    // Fracción de Excreción: FE = (E / FL) * 100
    const fe = cargaFiltrada > 0 ? (excrecion / cargaFiltrada) * 100 : 0;

    // Distribución anatómica de transportadores (SGLT2 S1/S2 ~90%, SGLT1 S3 ~10%)
    const capSglt2 = tmg * 0.90;
    const capSglt1 = tmg * 0.10;
    const reabSglt2 = Math.min(capSglt2, reabsorcion * 0.90);
    const reabSglt1 = Math.min(capSglt1, reabsorcion - reabSglt2);
    const pct2Val = Math.min(100, Math.round((reabSglt2 / capSglt2) * 100));
    const pct1Val = Math.min(100, Math.round((reabSglt1 / capSglt1) * 100));

    // Actualizar valores en el DOM
    if (valPglu) valPglu.innerText = `${Math.round(pglu)} mg/dL`;
    if (valTfg) valTfg.innerText = `${Math.round(tfg)} mL/min`;
    if (valTmg) valTmg.innerText = `${Math.round(tmg)} mg/min`;

    if (resFl) resFl.innerText = `${cargaFiltrada.toFixed(1)} mg/min`;
    if (resReab) resReab.innerText = `${reabsorcion.toFixed(1)} mg/min`;
    if (resExc) resExc.innerText = `${excrecion.toFixed(1)} mg/min`;
    if (resFe) resFe.innerText = `${fe.toFixed(1)} %`;

    if (fillSglt2) fillSglt2.style.width = `${pct2Val}%`;
    if (fillSglt1) fillSglt1.style.width = `${pct1Val}%`;
    if (pctSglt2) pctSglt2.innerText = `${pct2Val}%`;
    if (pctSglt1) pctSglt1.innerText = `${pct1Val}%`;

    // Diagnóstico clínico del estado de glucosa
    if (excrecion <= 0.5) {
      if (glucoseClinicalState) {
        glucoseClinicalState.innerText = 'Normoglucemia';
        glucoseClinicalState.className = 'formula-badge';
      }
      if (glucoseStatusTag) {
        glucoseStatusTag.className = 'clinical-status-tag normal';
        glucoseStatusTag.innerText = 'Reabsorción Completa (100%)';
      }
      if (glucoseStatusText) {
        glucoseStatusText.innerText = 'La carga filtrada está dentro del rango fisiológico normal. Toda la glucosa se reabsorbe por SGLT2 y SGLT1 sin glucosuria.';
      }
    } else if (excrecion < 80) {
      if (glucoseClinicalState) {
        glucoseClinicalState.innerText = 'Glucosuria Leve';
        glucoseClinicalState.className = 'formula-badge amber';
      }
      if (glucoseStatusTag) {
        glucoseStatusTag.className = 'clinical-status-tag warning';
        glucoseStatusTag.innerText = 'Superación de Umbral Renal';
      }
      if (glucoseStatusText) {
        glucoseStatusText.innerText = 'Glucemia plasmática supera el umbral de saturación renal (~180 mg/dL). Aparecen trazas de glucosa en la orina final.';
      }
    } else {
      if (glucoseClinicalState) {
        glucoseClinicalState.innerText = 'Glucosuria Masiva';
        glucoseClinicalState.className = 'formula-badge danger';
      }
      if (glucoseStatusTag) {
        glucoseStatusTag.className = 'clinical-status-tag danger';
        glucoseStatusTag.innerText = 'Saturación Completa TmG';
      }
      if (glucoseStatusText) {
        glucoseStatusText.innerText = 'Saturación total de transportadores SGLT2/SGLT1 (>375 mg/min). Toda glucosa adicional filtrada se excreta, provocando diuresis osmótica.';
      }
    }
  }

  sliderPglu?.addEventListener('input', calculateGlucoseFormulas);
  sliderTfg?.addEventListener('input', calculateGlucoseFormulas);
  sliderTmg?.addEventListener('input', calculateGlucoseFormulas);

  // Presets clínicos de Glucosa
  const presetNormal = document.querySelector('#preset-normal');
  const presetThreshold = document.querySelector('#preset-threshold');
  const presetDiabetes = document.querySelector('#preset-diabetes');
  const presetSglt2i = document.querySelector('#preset-sglt2i');

  presetNormal?.addEventListener('click', () => {
    if (sliderPglu) sliderPglu.value = '100';
    if (sliderTfg) sliderTfg.value = '125';
    if (sliderTmg) sliderTmg.value = '375';
    calculateGlucoseFormulas();
  });

  presetThreshold?.addEventListener('click', () => {
    if (sliderPglu) sliderPglu.value = '200';
    if (sliderTfg) sliderTfg.value = '125';
    if (sliderTmg) sliderTmg.value = '375';
    calculateGlucoseFormulas();
  });

  presetDiabetes?.addEventListener('click', () => {
    if (sliderPglu) sliderPglu.value = '320';
    if (sliderTfg) sliderTfg.value = '125';
    if (sliderTmg) sliderTmg.value = '375';
    calculateGlucoseFormulas();
  });

  presetSglt2i?.addEventListener('click', () => {
    if (sliderPglu) sliderPglu.value = '180';
    if (sliderTfg) sliderTfg.value = '110';
    if (sliderTmg) sliderTmg.value = '120'; // Inhibidor de SGLT2 reduce el TmG efectivo
    calculateGlucoseFormulas();
  });

  // ------------------------------------------------------------------
  // 2. CÁLCULOS DE FILTRACIÓN GLOMERULAR (FUERZAS DE STARLING)
  // ------------------------------------------------------------------
  const sliderPgc = document.querySelector('#slider-pgc');
  const sliderPbs = document.querySelector('#slider-pbs');
  const sliderPigc = document.querySelector('#slider-pigc');
  const sliderPibs = document.querySelector('#slider-pibs');
  const valPgc = document.querySelector('#val-pgc');
  const valPbs = document.querySelector('#val-pbs');
  const valPigc = document.querySelector('#val-pigc');
  const valPibs = document.querySelector('#val-pibs');
  const resPfn = document.querySelector('#res-pfn');
  const resStarlingTfg = document.querySelector('#res-starling-tfg');
  const starlingStatusTag = document.querySelector('#starling-status-tag');
  const starlingStatusText = document.querySelector('#starling-status-text');

  function calculateStarlingFormulas() {
    if (!sliderPgc || !sliderPbs || !sliderPigc || !sliderPibs) return;

    const pgc = parseFloat(sliderPgc.value);   // P_GC
    const pbs = parseFloat(sliderPbs.value);   // P_BS
    const pigc = parseFloat(sliderPigc.value); // pi_GC
    const pibs = parseFloat(sliderPibs.value); // pi_BS

    // PFN = (P_GC - P_BS) - (pi_GC - pi_BS)
    const pfn = (pgc - pbs) - (pigc - pibs);

    // TFG = Kf * PFN (Kf normal promedio = 12.5 mL/min/mmHg)
    const kf = 12.5;
    const starlingTfg = Math.max(0, kf * pfn);

    if (valPgc) valPgc.innerText = `${Math.round(pgc)} mmHg`;
    if (valPbs) valPbs.innerText = `${Math.round(pbs)} mmHg`;
    if (valPigc) valPigc.innerText = `${Math.round(pigc)} mmHg`;
    if (valPibs) valPibs.innerText = `${Math.round(pibs)} mmHg`;

    if (resPfn) resPfn.innerText = `${pfn >= 0 ? '+' : ''}${pfn.toFixed(1)} mmHg`;
    if (resStarlingTfg) resStarlingTfg.innerText = `${starlingTfg.toFixed(1)} mL/min`;

    if (pfn >= 8 && pfn <= 12) {
      if (starlingStatusTag) starlingStatusTag.className = 'clinical-status-tag normal';
      if (starlingStatusText) starlingStatusText.innerText = 'Ultrafiltración fisiológica normal (+10 mmHg). Balance óptimo de presiones.';
    } else if (pfn > 12) {
      if (starlingStatusTag) starlingStatusTag.className = 'clinical-status-tag warning';
      if (starlingStatusText) starlingStatusText.innerText = 'Hiperfiltración glomerular por elevación de presión capilar hidrostática.';
    } else if (pfn > 0) {
      if (starlingStatusTag) starlingStatusTag.className = 'clinical-status-tag warning';
      if (starlingStatusText) starlingStatusText.innerText = 'Hipofiltración glomerular. Presión neta reducida.';
    } else {
      if (starlingStatusTag) starlingStatusTag.className = 'clinical-status-tag danger';
      if (starlingStatusText) starlingStatusText.innerText = 'Cese de filtración glomerular: presiones opuestas superan la presión capilar.';
    }
  }

  sliderPgc?.addEventListener('input', calculateStarlingFormulas);
  sliderPbs?.addEventListener('input', calculateStarlingFormulas);
  sliderPigc?.addEventListener('input', calculateStarlingFormulas);
  sliderPibs?.addEventListener('input', calculateStarlingFormulas);

  // Ejecución inicial de cálculos
  calculateGlucoseFormulas();
  calculateStarlingFormulas();

  // Devolver controlador de cambio de pestaña para el módulo principal
  return {
    switchFormulaModule(id) {
      if (id === '1') {
        if (anatomyView) anatomyView.style.display = 'block';
        if (formulasView) formulasView.style.display = 'none';
        if (structureTitle) structureTitle.innerText = 'Corteza renal';
      } else if (id === '2') {
        if (anatomyView) anatomyView.style.display = 'none';
        if (formulasView) formulasView.style.display = 'block';
        setFormulaSubtab('glucose');
      } else if (id === '3') {
        if (anatomyView) anatomyView.style.display = 'none';
        if (formulasView) formulasView.style.display = 'block';
        setFormulaSubtab('filtration');
      }
    },
    setFormulaSubtab
  };
}
