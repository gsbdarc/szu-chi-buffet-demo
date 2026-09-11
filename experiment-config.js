// Shared validation for the designer, imported files, and participant bootstrap.
export const clone = value => JSON.parse(JSON.stringify(value));
export const newId = prefix => prefix + '-' + crypto.randomUUID();
const fail = message => { throw new Error(message); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
function text(value, name, max, required = true) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(`${name} is required and must be at most ${max} characters.`);
  return value;
}
function id(value, name) {
  text(value, name, 80);
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(value)) fail(`${name} is invalid.`);
  return value;
}
function version(value, catalog) {
  if (value !== catalog.catalogVersion) fail('This setup uses a different food catalog. Keep the original file and ask for a compatible build or create a new experiment.');
  return value;
}
function foodIds(value, catalog, draft) {
  if (!Array.isArray(value) || value.length > 12 || (!draft && !value.length)) fail('Choose 1–12 different foods.');
  if (new Set(value).size !== value.length) fail('A food can appear only once in a condition.');
  if (value.some(key => typeof key !== 'string' || !catalog.foods.some(food => food.id === key))) fail('This setup contains a food unavailable in this catalog.');
  return [...value];
}
export function validateExperiment(value, catalog) {
  if (!object(value) || value.schemaVersion !== 1) fail('This experiment file format is not supported.');
  if (!Array.isArray(value.conditions) || value.conditions.length < 1 || value.conditions.length > 64) fail('An experiment needs 1–64 conditions.');
  const result = {
    schemaVersion: 1, catalogVersion: version(value.catalogVersion, catalog), studyId: id(value.studyId, 'Study ID'),
    studyName: text(value.studyName, 'Study name', 100, false), taskInstructions: text(value.taskInstructions, 'Instructions', 2000, false),
    conditions: value.conditions.map(c => {
      if (!object(c)) fail('A condition is invalid.');
      return {id: id(c.id, 'Condition ID'), name: text(c.name, 'Condition name', 80, false), foodIds: foodIds(c.foodIds, catalog, true)};
    })
  };
  if (new Set(result.conditions.map(c => c.id)).size !== result.conditions.length) fail('Condition IDs must be unique.');
  return result;
}
export function validateLaunch(value, catalog) {
  if (!object(value) || value.schemaVersion !== 1) fail('This participant link format is not supported.');
  if (!['participant', 'preview'].includes(value.runMode)) fail('This task mode is invalid.');
  return {
    schemaVersion: 1, catalogVersion: version(value.catalogVersion, catalog),
    studyId: id(value.studyId, 'Study ID'), studyName: text(value.studyName, 'Study name', 100),
    conditionId: id(value.conditionId, 'Condition ID'), conditionName: text(value.conditionName, 'Condition name', 80),
    taskInstructions: text(value.taskInstructions, 'Instructions', 2000),
    runMode: value.runMode, foodIds: foodIds(value.foodIds, catalog, false)
  };
}
export function launchFor(experiment, condition, mode, catalog) {
  return validateLaunch({schemaVersion: 1, catalogVersion: experiment.catalogVersion, studyId: experiment.studyId,
    studyName: experiment.studyName, taskInstructions: experiment.taskInstructions, conditionId: condition.id,
    conditionName: condition.name, runMode: mode, foodIds: [...condition.foodIds]}, catalog);
}
export function encodeLaunch(launch) {
  const bytes = new TextEncoder().encode(JSON.stringify(launch));
  return btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join('')).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
export function decodeLaunch(encoded, catalog) {
  if (!encoded || encoded.length > 24000 || !/^[A-Za-z0-9_-]+$/.test(encoded)) fail('The participant link is incomplete or invalid.');
  try {
    const raw = atob(encoded.replaceAll('-', '+').replaceAll('_', '/'));
    return validateLaunch(JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(Uint8Array.from(raw, c => c.charCodeAt(0)))), catalog);
  } catch (error) { throw new Error('Cannot open this participant link. ' + error.message); }
}
export function participantUrl(launch, base = location.href) {
  const url = new URL('index.html', base); url.hash = 'setup=' + encodeLaunch(launch); return url.href;
}
export async function loadCatalog() {
  const response = await fetch('catalog.json', {cache: 'no-store'});
  if (!response.ok) fail('The food catalog could not load. Reload the page and try again.');
  const catalog = await response.json();
  if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.foods) || !catalog.foods.length) fail('The food catalog is invalid.');
  return catalog;
}
