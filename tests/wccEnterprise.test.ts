import assert from 'node:assert/strict';
import {
  WCC_WORK_TEMPLATES,
  buildLegacyAnnexure,
  calculateReversalRestoration,
  calculateWccTotals,
  canTransitionWcc,
  createWccDraft,
  multiplyDecimal,
  validateWccDraft,
  type WccEnterpriseDraft,
  type WccServiceLine,
} from '../src/lib/wccEnterprise';

const line = (overrides: Partial<WccServiceLine> = {}): WccServiceLine => ({
  id: 'LINE-1', orderItem: '10', serviceLine: '0010', serviceCode: 'SRV-001', description: 'Contracted service',
  specification: '', wbsCode: '', costCentre: 'CC-01', taxCode: 'GST18', unit: 'NOS', orderedQty: 100,
  previousQty: 0, currentQty: 10, rate: 125.55, toleranceQty: 0, retentionPercent: 0,
  locationReference: 'SITE-A', startDate: '', completionDate: '', remarks: '', selected: true,
  unplanned: false, justification: '', ...overrides,
});

const validDraft = (category = 'cultivation'): WccEnterpriseDraft => {
  const draft = createWccDraft({ id: 'maker-1', name: 'Maker' });
  draft.header = {
    ...draft.header, vendorId: 'VEN-1', vendorName: 'Vendor One', referenceNumber: 'WO-1001',
    statementFrom: '2026-08-01', statementTo: '2026-08-03', workCategory: category,
    orderValue: 100000, projectSiteLabel: 'Project Site A',
  };
  draft.serviceLines = [line()];
  draft.landIds = category === 'cultivation' ? ['LAND-001'] : [];
  draft.finalConfirmations.submissionDeclaration = true;
  return draft;
};

const blocking = (draft: WccEnterpriseDraft) => validateWccDraft(draft).filter((item) => item.severity === 'blocking');

const tests: Array<[string, () => void]> = [
  ['configuration covers cultivation, civil, lump-sum, manpower and equipment hire', () => {
    const ids = new Set(WCC_WORK_TEMPLATES.map((item) => item.id));
    ['cultivation', 'civil', 'lump_sum', 'manpower', 'transport'].forEach((id) => assert.equal(ids.has(id), true));
  }],
  ['cultivation WCC passes baseline validation', () => assert.deepEqual(blocking(validDraft('cultivation')), [])],
  ['civil measurement WCC calculates quantity and rate', () => {
    const draft = validDraft('civil');
    draft.valuationMethod = 'measurement_based';
    draft.serviceLines = [line({ currentQty: 12.5, rate: 801.25 })];
    assert.equal(calculateWccTotals(draft).gross, 10015.63);
  }],
  ['lump-sum WCC values accepted completion percentage', () => {
    const draft = validDraft('lump_sum');
    draft.valuationMethod = 'lump_sum_percentage';
    draft.serviceLines = [line({ currentQty: 35, rate: 80000, orderedQty: 100 })];
    assert.equal(calculateWccTotals(draft).gross, 28000);
  }],
  ['manpower WCC uses accepted attendance quantity', () => {
    const draft = validDraft('manpower');
    draft.valuationMethod = 'time_based';
    draft.serviceLines = [line({ unit: 'MAN-DAY', currentQty: 23, rate: 750 })];
    assert.equal(calculateWccTotals(draft).gross, 17250);
  }],
  ['equipment hire uses accepted usage', () => {
    const draft = validDraft('transport');
    draft.valuationMethod = 'equipment_usage';
    draft.serviceLines = [line({ unit: 'HOUR', currentQty: 18.5, rate: 2100 })];
    assert.equal(calculateWccTotals(draft).gross, 38850);
  }],
  ['partial and final WCCs preserve cumulative and remaining commitment', () => {
    const partial = validDraft();
    partial.header.previouslyCertifiedValue = 25000;
    partial.serviceLines = [line({ currentQty: 20, rate: 1000 })];
    assert.deepEqual(calculateWccTotals(partial), { gross: 20000, retention: 0, additions: 0, deductions: 0, net: 20000, previous: 25000, cumulative: 45000, remaining: 55000 });
    partial.header.wccType = 'final';
    assert.equal(blocking(partial).some((item) => item.field === 'allWorkComplete'), true);
    partial.finalConfirmations = { submissionDeclaration: true, allWorkComplete: true, defectsResolved: true, measurementsRecorded: true, documentsAttached: true, remainingScopeDeclared: true };
    assert.equal(blocking(partial).some((item) => item.step === 6), false);
  }],
  ['over-certification is blocked', () => {
    const draft = validDraft();
    draft.serviceLines = [line({ orderedQty: 10, previousQty: 7, currentQty: 4 })];
    assert.equal(blocking(draft).some((item) => item.message.includes('exceeds')), true);
  }],
  ['unplanned work needs justification and explicit approval', () => {
    const draft = validDraft();
    draft.serviceLines = [line({ unplanned: true })];
    assert.equal(blocking(draft).some((item) => item.field.includes('justification')), true);
    draft.serviceLines[0].justification = 'Emergency work instructed at site';
    const findings = validateWccDraft(draft);
    assert.equal(findings.some((item) => item.severity === 'approval' && item.field.includes('approval')), true);
  }],
  ['changes-requested WCC can be corrected and resubmitted', () => {
    const draft = validDraft();
    draft.status = 'changes_requested';
    const decision = canTransitionWcc(draft, { action: 'submit', actorId: 'maker-1', permissions: ['wcc.submit'] });
    assert.deepEqual([decision.allowed, decision.nextStatus], [true, 'submitted']);
  }],
  ['approval permissions and maker-checker separation are enforced', () => {
    const draft = validDraft();
    draft.status = 'pending_approval';
    assert.equal(canTransitionWcc(draft, { action: 'approve', actorId: 'approver-1', permissions: [] }).allowed, false);
    assert.equal(canTransitionWcc(draft, { action: 'approve', actorId: 'maker-1', permissions: ['wcc.approve'] }).allowed, false);
    assert.equal(canTransitionWcc(draft, { action: 'approve', actorId: 'approver-1', permissions: ['wcc.approve'] }).allowed, true);
  }],
  ['reversal requires reason and restores certified quantity/value', () => {
    const draft = validDraft();
    draft.status = 'approved';
    assert.equal(canTransitionWcc(draft, { action: 'reverse', actorId: 'finance-1', permissions: ['wcc.reverse'] }).allowed, false);
    assert.deepEqual(calculateReversalRestoration(draft), { quantity: 10, value: 1255.5 });
  }],
  ['print/PDF annexure snapshot includes the enterprise model and dynamic lines', () => {
    const draft = validDraft('civil');
    const annexure = buildLegacyAnnexure(draft);
    assert.equal(annexure.enterprise.schemaVersion, 2);
    assert.equal(annexure.activities[0], 'Contracted service');
    assert.equal(annexure.grandTotal, 10);
  }],
  ['decimal multiplication rounds financial amounts uniformly to two places', () => {
    assert.equal(multiplyDecimal(3.335, 3), 10.01);
    assert.equal(multiplyDecimal(0.1, 0.2), 0.02);
  }],
];

let passed = 0;
for (const [name, run] of tests) {
  try { run(); passed += 1; process.stdout.write(`✓ ${name}\n`); }
  catch (error) { process.stderr.write(`✗ ${name}\n`); throw error; }
}
process.stdout.write(`\n${passed}/${tests.length} WCC enterprise scenarios passed.\n`);
