// Données d'exemple réalistes (fictives) pour les tests d'affichage.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const d = (y, m, j) => `${y}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}`;

function purchases() {
  const fourn = ['AKWEL TOOLING', 'AMME', 'PLASTICUM', 'FERKAN', 'SOUDFIX'];
  const proj = ['CX735', 'EMA L384', 'HAB K9'];
  const out = [];
  for (let i = 1; i <= 24; i++) {
    out.push({
      id: 'ID17000000' + String(i).padStart(2, '0'), line: i, dateCreation: d(2026, 1 + (i % 10), 1 + (i % 27)),
      projet: proj[i % 3], reference: 'P10' + (38400 + i) + 'A', description: 'Achat de test numéro ' + i + ' — outillage et fixation de la ligne',
      capexOpex: ['CAPEX', 'OPEX', 'Costumer'][i % 3], numCapex: i % 3 === 0 ? 'Budget CAPEX 2026' : '', _budgetId: i % 3 === 0 ? 'B1' : '',
      fournisseur: fourn[i % 5], numDA: '5502' + (9000 + i), numPO: i % 4 ? '44000' + (95000 + i) : '', puHT: 1200 * i, quantite: 1 + (i % 3),
      devise: i % 7 ? 'EUR' : 'USD', acheteur: 'YTAHIRI', numAsset: '', dateMIGO: d(2026, 1 + (i % 11), 10), recMIGO: ['ONGOING', 'CLOSED', 'PENDING', 'CANCELLED'][i % 4],
      observations: i % 5 ? '' : 'Remarque sur l\'achat', lienOffre: '', wf: ['Demande', 'Approuvé', 'Commandé', 'Livré'][i % 4],
      dateCommande: d(2026, 1 + (i % 9), 5), dateLivPrevue: d(2026, 2 + (i % 9), 20), dateLivReelle: i % 4 === 3 ? d(2026, 2 + (i % 9), 22) : '',
      attachments: [], history: [{ at: '2026-10-01T10:00:00Z', by: 'YTAHIRI', act: 'Création' }], createdBy: 'YTAHIRI', createdAt: '2026-10-01T10:00:00Z'
    });
  }
  return out;
}
const settings = {
  projets: ['CX735', 'EMA L384', 'HAB K9', 'PROJET HAB'], fournisseurs: ['AKWEL TOOLING', 'AMME', 'PLASTICUM', 'FERKAN', 'SOUDFIX'],
  references: ['P1038523A', 'P1041736A'], acheteurs: ['YTAHIRI', 'AMME'],
  budgets: [
    { id: 'B1', projet: 'CX735', type: 'CAPEX', label: 'Budget CAPEX 2026', montant: 250000, devise: 'EUR', immobilisations: [{ id: 'I1', numero: 'IMM-001', description: 'Moule réservoir', montant: 150000 }, { id: 'I2', numero: 'IMM-002', description: 'Banc de contrôle', montant: 100000 }] },
    { id: 'B2', projet: 'EMA L384', type: 'OPEX', label: 'Budget OPEX essais', montant: 40000, devise: 'EUR' }
  ]
};
function engDb() {
  return {
    companies: [{ id: 'ec1', name: 'Akwel Automotive' }, { id: 'ec2', name: 'Ford Europe' }],
    types: [{ id: 'et1', name: 'Sensor', fields: [{ id: 'ef1', label: 'Référence article', kind: 'text' }] }, { id: 'et2', name: 'Pressure', fields: [{ id: 'ef2', label: 'Valeur', kind: 'number' }, { id: 'ef3', label: 'Unité', kind: 'text' }] }],
    solutions: [1, 2, 3, 4].map(i => ({ id: 'es' + i, name: 'Technical Specification – Station de test étanchéité ' + i, productLine: 'Fuel Lines', specHtml: '<p>Texte de spécification long pour la solution ' + i + ', avec plusieurs phrases pour remplir la page.</p><img src="' + PNG + '" width="340">', reqs: [{ id: 'r' + i, typeId: 'et2', values: { ef2: '5', ef3: 'bar' }, category: 'Sécurité' }], folderLink: '', standardRef: 'ISO 1234', dmRef: 'DM-55' })),
    projects: [1, 2].map(i => ({ id: 'ep' + i, name: 'Ligne lavage CX735 n°' + i, companyId: 'ec1', solutionIds: ['es1', 'es2'], operations: [], cycle: '45 s', date: '2026-09-01' })),
    acceptances: [{ id: 'ea1', title: 'Réception station lavage', companyId: 'ec1', date: '2026-09-10', inspector: 'YT', projectId: 'ep1', points: [{ id: 'pt1', solution: 'Station 1', category: 'Sécurité', description: 'Arrêt d\'urgence', status: 'OK', action: '', comment: '', images: [] }, { id: 'pt2', solution: 'Station 1', category: 'Dimensionnel', description: 'Cote 12 mm', status: '', action: '', comment: '', images: [] }], created: 1, modified: 1 }],
    operations: [{ id: 'eo1', name: 'Chargement pièce', type: 'Manuelle', compType: 'Tube' }],
    branding: { logo: '', docname: 'LEAK TEST STATION V2', label: 'TECHNICAL SPECIFICATION', conf: 'L2 - Restricted access', code: 'CL102' }
  };
}
function pmDb() {
  const MS = ['Drawing release', 'CDC', 'RFQ', 'PR', 'PO', 'Study review', 'Provisional acceptance', 'Industrial acceptance', 'Livraison', 'Trial Run', 'APP'];
  const tool = (n, k) => ({ id: 'T' + n + k, name: 'Outil ' + k + ' — moule réservoir', status: 'En cours', milestones: MS.map((l, j) => ({ id: 'M' + n + k + j, label: l, status: j < 3 ? 'Fait' : j === 3 ? 'En cours' : 'À faire', date: d(2026, 1 + j, 10 + k) })),
    notes: [{ id: 'N' + n + k, text: 'Relancer le fournisseur pour le devis', ts: 1760000000000, jalon: 'RFQ', kind: 'Action', status: 'À faire', urgency: 'Haute', dueDate: '2026-10-01', comments: [] }],
    subtools: [{ id: 'S' + n + k, name: 'Préhenseur', status: 'En cours', milestones: MS.slice(0, 4).map((l, j) => ({ id: 'SM' + n + k + j, label: l, status: 'À faire', date: d(2026, 3 + j, 5) })), notes: [] }] });
  return {
    projects: [1, 2, 3].map(n => ({ id: 'Pp' + n, name: 'Projet réservoir CX735 ' + n, code: 'PRJ-2026-00' + n, customerId: 'Pc1', lineId: 'Pl1', status: ['Development', 'Validation', 'Quotation'][n - 1], sop: d(2027, n, 1), eop: d(2032, n, 1), programManager: 'YT',
      volumes: [{ year: 2027, volume: 150000 }, { year: 2028, volume: 220000 }], openHoursDay: 8, shiftsWeek: 15, weeksYear: 47,
      products: [{ id: 'pr' + n, sapRef: 'SAP-' + n, name: 'Tube carburant ' + n, cycleTime: 45, availability: 85, machines: 2, prodStatus: 'Draft', bom: [{ id: 'b' + n, ref: 'R1', designation: 'Raccord rapide', type: 'Raccord', qty: 2, unit: 'pc', photo: '', sub: null }], docs: [{ type: 'PFMEA', number: 'D-1', owner: 'YT', link: '' }] }],
      tools: [tool(n, 1), tool(n, 2)], toolPacks: [], created: 1, modified: 1760000000000 })),
    customers: [{ id: 'Pc1', name: 'FORD' }, { id: 'Pc2', name: 'STELLANTIS' }],
    lines: [{ id: 'Pl1', name: 'Fuel Lines' }],
    actions: [{ id: 'A1', text: 'Préparer la revue de projet', ts: 1760000000000, jalon: '', kind: 'Action', status: 'En cours', urgency: 'Moyenne', dueDate: '2026-12-01', comments: [] }]
  };
}
module.exports = {
  seed: () => ({
    suivi_autosave: JSON.stringify(purchases()), suivi_settings: JSON.stringify(settings), eng_db: JSON.stringify(engDb()), pm_db: JSON.stringify(pmDb()),
    hp_suppliers: JSON.stringify({ AMME: { contact: 'M. Dupont', email: 'contact@example.com', tel: '0102030405', delai: '30' } }), hp_user: 'YTAHIRI'
  })
};
