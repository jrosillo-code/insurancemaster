import type { Customer360Dataset, ProductLine } from '../model';
import {
  account,
  claim,
  coverageTerm,
  document,
  insuredObject,
  passages,
  person,
  pick,
  policy,
  receipt,
  seededRandom,
} from './builders';

/**
 * Generated filler clients.
 *
 * The anchors carry the interesting failure modes; these exist so the portfolio has
 * realistic breadth — enough clients, insurers and product lines that a retrieval
 * bug cannot hide behind a dataset of four records. Generation is seeded, so the
 * same 24 clients appear on every run and evaluation scores stay comparable.
 */

const GIVEN_NAMES = [
  'Marcos', 'Beatriz', 'Alberto', 'Nuria', 'Sergio', 'Cristina', 'Iván', 'Lucía',
  'Raúl', 'Silvia', 'Andrés', 'Patricia', 'Óscar', 'Teresa', 'Gonzalo', 'Alicia',
  'Jorge', 'Marina', 'Rubén', 'Clara', 'Diego', 'Irene', 'Adrián', 'Sara',
] as const;

const SURNAMES = [
  'Navarro Gil', 'Vega Campos', 'Herrera Luna', 'Peña Soler', 'Castaño Rey',
  'Miralles Font', 'Bravo Sanz', 'Cordero Pinto', 'Salas Bermejo', 'Duarte Roca',
  'Anguita Mora', 'Bustos Prat', 'Cabezas Nieto', 'Lorenzo Vera', 'Segura Blay',
  'Quintana Rus', 'Piñeiro Adán', 'Estévez Mur', 'Gallardo Vidal', 'Roldán Cid',
  'Vázquez Puig', 'Merino Solà', 'Pardo Estrada', 'Cifuentes Olmo',
] as const;

const CITIES = ['Madrid', 'Barcelona', 'Valencia', 'Sevilla', 'Zaragoza', 'Bilbao', 'Málaga', 'Vigo'] as const;

const INSURERS = ['Allianz', 'Mapfre', 'AXA', 'Generali', 'Zurich', 'Línea Directa', 'Santalucía', 'Adeslas'] as const;

const VEHICLES = [
  ['Seat', 'Ibiza 1.0 TSI'], ['Renault', 'Clio E-Tech'], ['Peugeot', '3008 Hybrid'],
  ['Toyota', 'Corolla 1.8'], ['Kia', 'Sportage 1.6'], ['Ford', 'Focus 1.0'],
  ['Dacia', 'Duster 1.3'], ['Hyundai', 'Tucson 1.6'],
] as const;

interface ProductSpec {
  product: ProductLine;
  label: string;
  premiumRange: [number, number];
}

const PRODUCT_SPECS: readonly ProductSpec[] = [
  { product: 'AUTO', label: 'Auto — Terceros ampliado', premiumRange: [320, 890] },
  { product: 'HOGAR', label: 'Hogar — Multirriesgo', premiumRange: [190, 540] },
  { product: 'SALUD', label: 'Salud — Cuadro médico', premiumRange: [620, 1480] },
  { product: 'VIDA', label: 'Vida — Riesgo', premiumRange: [140, 460] },
  { product: 'VIAJE', label: 'Viaje — Anual', premiumRange: [80, 280] },
];

/** Formats a number to two decimals without floating-point drift in the fixture. */
function money(rng: () => number, [min, max]: [number, number]): number {
  return Math.round((min + rng() * (max - min)) * 100) / 100;
}

/** Produces a stable ISO date offset by `days` from a base date. */
function shiftDate(base: string, days: number): string {
  const date = new Date(`${base}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function buildGeneratedClients(count = 24): Customer360Dataset {
  const rng = seededRandom(20260805);
  const dataset: Customer360Dataset = {
    parties: [],
    relationships: [],
    accounts: [],
    policies: [],
    insuredObjects: [],
    coverageTerms: [],
    claims: [],
    receipts: [],
    documents: [],
    procedures: [],
  };

  for (let i = 0; i < count; i += 1) {
    const index = String(i + 1).padStart(2, '0');
    const partyId = `party_gen${index}`;
    const given = GIVEN_NAMES[i % GIVEN_NAMES.length] ?? 'Cliente';
    const surname = SURNAMES[i % SURNAMES.length] ?? 'Sintético';
    const city = pick(rng, CITIES);
    const email = `cliente${index}@cliente.test`;

    dataset.parties.push(
      person({
        id: partyId,
        name: `${given} ${surname}`,
        surname,
        email,
        phone: `+34 600 ${index}0 ${index}00`,
        taxIdSynthetic: `X99${index}999Z`,
        city,
      }),
    );
    dataset.accounts.push(
      account({
        id: `acc_gen${index}`,
        partyId,
        email,
        displayName: `${given} ${surname.split(' ')[0] ?? surname}`,
      }),
    );

    // One to three policies per client, so multi-policy portfolios are common
    // enough for ambiguity cases to be realistic.
    const policyCount = 1 + Math.floor(rng() * 3);
    const chosen = new Set<ProductLine>();
    for (let p = 0; p < policyCount; p += 1) {
      const spec = pick(rng, PRODUCT_SPECS);
      if (chosen.has(spec.product)) continue;
      chosen.add(spec.product);

      const policyId = `pol_gen${index}_${spec.product.toLowerCase()}`;
      const policyNumber = `${spec.product.slice(0, 3)}-2026-${index}${p}${p}`;
      const inception = shiftDate('2026-01-01', Math.floor(rng() * 300));
      const renewal = shiftDate(inception, 365);
      const premium = money(rng, spec.premiumRange);
      const insuredObjectIds: string[] = [];
      const documentIds: string[] = [];

      if (spec.product === 'AUTO') {
        const [make, model] = pick(rng, VEHICLES);
        const plate = `${1000 + Math.floor(rng() * 8999)} ${['KLM', 'MBN', 'JDR', 'LPT', 'NPQ'][i % 5]}`;
        const objectId = `obj_gen${index}_vehiculo`;
        dataset.insuredObjects.push(
          insuredObject({
            id: objectId,
            kind: 'VEHICLE',
            label: `${make} ${model} · ${plate}`,
            attributes: { matricula: plate, marca: make, modelo: model, uso: 'Particular' },
          }),
        );
        insuredObjectIds.push(objectId);

        const docId = `doc_gen${index}_auto_cp`;
        const deductible = pick(rng, ['150 €', '300 €', '600 €']);
        dataset.documents.push(
          document({
            id: docId,
            kind: 'POLICY_SCHEDULE',
            title: `Condiciones particulares — Auto ${pick(rng, INSURERS)}`,
            ownerPartyId: partyId,
            policyId,
            effectiveFrom: inception,
            effectiveTo: renewal,
            passages: passages(
              [
                {
                  heading: 'Datos del riesgo',
                  text: `Vehículo asegurado: ${make} ${model}, matrícula ${plate}. Uso particular.`,
                },
                {
                  heading: 'Franquicia',
                  text: `La franquicia aplicable a los daños propios es de ${deductible} por siniestro.`,
                },
              ],
              docId,
            ),
          }),
        );
        documentIds.push(docId);
        dataset.coverageTerms.push(
          coverageTerm({
            id: `cvt_gen${index}_franquicia`,
            policyId,
            kind: 'DEDUCTIBLE',
            key: 'franquicia_danos_propios',
            label: 'Franquicia de daños propios',
            value: deductible,
            documentId: docId,
            passageId: `${docId}_p2`,
            effectiveFrom: inception,
            effectiveTo: renewal,
          }),
        );
      }

      if (spec.product === 'HOGAR') {
        const objectId = `obj_gen${index}_vivienda`;
        dataset.insuredObjects.push(
          insuredObject({
            id: objectId,
            kind: 'PROPERTY',
            label: `Vivienda habitual · ${city}`,
            attributes: { direccion: `Calle Sintética ${i + 1}, ${city}`, tipo: 'Vivienda habitual' },
          }),
        );
        insuredObjectIds.push(objectId);
      }

      dataset.policies.push(
        policy({
          id: policyId,
          policyNumber,
          holderPartyId: partyId,
          insurer: pick(rng, INSURERS),
          product: spec.product,
          productLabel: spec.label,
          inceptionDate: inception,
          renewalDate: renewal,
          premium,
          previousPremium: Math.round(premium * (0.86 + rng() * 0.1) * 100) / 100,
          insuredObjectIds,
          documentIds,
        }),
      );

      dataset.receipts.push(
        receipt({
          id: `rec_gen${index}_${p}`,
          receiptNumber: `REC-2026-9${index}${p}0`,
          policyId,
          amount: premium,
          dueDate: inception,
          status: rng() > 0.85 ? 'PENDING' : 'PAID',
          paidAt: inception,
          periodFrom: inception,
          periodTo: renewal,
        }),
      );
    }

    // A minority of clients have an open claim, so "what's happening with my
    // claim?" has enough variety to be worth evaluating.
    const firstPolicy = dataset.policies.find((p) => p.holderPartyId === partyId);
    if (firstPolicy && rng() > 0.7) {
      const lossDate = shiftDate(firstPolicy.inceptionDate, 40 + Math.floor(rng() * 120));
      dataset.claims.push(
        claim({
          id: `clm_gen${index}`,
          claimNumber: `SIN-2026-9${index}00`,
          policyId: firstPolicy.id,
          holderPartyId: partyId,
          status: pick(rng, ['REPORTED', 'AWAITING_DOCUMENTS', 'UNDER_REVIEW', 'INSURER_ASSESSING'] as const),
          lossDate,
          reportedDate: shiftDate(lossDate, 1),
          description: 'Siniestro sintético para pruebas de cartera.',
          chronology: [
            { at: shiftDate(lossDate, 1), party: 'CLIENT', description: 'Comunicación del siniestro.' },
            { at: shiftDate(lossDate, 2), party: 'ROSILLO', description: 'Apertura del expediente.' },
          ],
          outstandingItems: [{ label: 'Documentación pendiente de revisión', responsible: 'ROSILLO' }],
          reserveAmount: Math.round(rng() * 3000),
        }),
      );
    }
  }

  return dataset;
}
