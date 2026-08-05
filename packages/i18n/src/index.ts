/**
 * @rosillo/i18n — one locale, driving everything a person reads.
 *
 * The platform is Spanish-first, but "English" here means the whole surface: chrome,
 * evidence labels, employee workspace, and the language the model is asked to answer
 * in. There is deliberately no way to have an English interface wrapped around a
 * Spanish answer — `resolveLocale()` produces the value that goes to the pipeline as
 * well as to the components.
 *
 * What is NOT translated, on purpose: the synthetic dataset. Policy names, insurer
 * names and document passages are quoted source material — an English rendering of
 * "Todo Riesgo con franquicia" would be a paraphrase presented as a citation, which
 * is exactly what the evidence rules exist to prevent. Quoted text stays in the
 * language of the document it came from, and the label around it is translated.
 *
 * SYNTHETIC DATA ONLY.
 */

export * from './locale';
export * from './labels';
export * from './client';
export * from './employee';
