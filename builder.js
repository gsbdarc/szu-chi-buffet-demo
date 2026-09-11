import {clone, newId, validateExperiment, launchFor, participantUrl, loadCatalog} from './experiment-config.js';
const $ = id => document.getElementById(id);
const storageKey = 'buffet-experiment-draft-v1';
document.querySelectorAll('button,input,textarea').forEach(node => node.disabled = true);
let catalog, experiment, selectedId, dragId, recovery = null, storageBlocked = false;
const current = () => experiment.conditions.find(c => c.id === selectedId);
function notice(message = '') { $('message').textContent = message; $('message').hidden = !message; }
function download(value, filename) {
  const url = URL.createObjectURL(new Blob([typeof value === 'string' ? value : JSON.stringify(value, null, 2)], {type:'application/json'}));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function save() {
  if (recovery) return;
  try {
    localStorage.setItem(storageKey, JSON.stringify({experiment, selectedId}));
    $('save-status').textContent = 'Saved in this browser'; storageBlocked = false;
  } catch {
    $('save-status').textContent = 'Not saved · export a file'; storageBlocked = true;
    notice('Browser storage is unavailable or full. Use Export file to keep your changes.');
  }
}
function makeExperiment() {
  const e = clone(catalog.defaultExperiment); e.studyId = newId('study'); e.conditions[0].id = newId('condition'); return e;
}
function adopt(e, selection) {
  experiment = e; selectedId = e.conditions.some(c => c.id === selection) ? selection : e.conditions[0].id;
  recovery = null; showDesign(); render(); save();
}
function guard(action) { try { action(); } catch(error) { notice(error.message); } }
function launch(mode) { return launchFor(experiment, current(), mode, catalog); }
function updateReadiness() {
  let error = '';
  try { launch('participant'); } catch(e) { error = e.message; }
  $('validation').textContent = error || 'The participant link keeps a fixed copy of this condition.';
  for (const id of ['preview', 'preview-tab', 'copy-link']) $(id).disabled = !!error || !!recovery;
  $('food-count').textContent = current().foodIds.length + ' foods';
  $('counter-title').textContent = current().name || 'Unnamed condition';
  $('link-fallback').hidden = true;
}
function element(tag, className, content) {
  const node = document.createElement(tag); if (className) node.className = className;
  if (content !== undefined) node.textContent = content; return node;
}
function button(label, action, aria) {
  const node = element('button', '', label); node.type = 'button'; node.onclick = action;
  if (aria) node.setAttribute('aria-label', aria); return node;
}
function thumbnail(food) {
  const image = document.createElement('img'); image.src = `food-thumbnails/${food.id}.png`; image.alt = ''; image.draggable = false; return image;
}
function renderConditions() {
  $('conditions').replaceChildren(); $('condition-count').textContent = experiment.conditions.length;
  for (const condition of experiment.conditions) {
    const node = button('', () => { selectedId = condition.id; render(); save(); });
    node.dataset.condition = condition.id;
    node.setAttribute('aria-pressed', condition.id === selectedId);
    node.append(element('span', '', condition.name || 'Unnamed condition'), element('small', '', `${condition.foodIds.length} foods`));
    $('conditions').append(node);
  }
  $('delete-condition').disabled = experiment.conditions.length === 1;
  $('add-condition').disabled = $('duplicate-condition').disabled = experiment.conditions.length >= 64;
}
function moveFood(id, destination) {
  const ids = current().foodIds, previous = ids.indexOf(id);
  if (previous < 0 && ids.length >= 12) { notice('This buffet supports at most 12 foods.'); return; }
  if (previous >= 0) { ids.splice(previous, 1); if (previous < destination) destination--; }
  ids.splice(destination, 0, id); changed();
}
function attachDrag(node, foodId) {
  node.draggable = true;
  node.addEventListener('dragstart', event => {
    dragId = foodId; event.dataTransfer.setData('text/plain', foodId); event.dataTransfer.effectAllowed = 'move'; node.classList.add('dragging');
  });
  node.addEventListener('dragend', () => { dragId = null; node.classList.remove('dragging'); clearDropMarks(); });
}
function clearDropMarks() { document.querySelectorAll('.drop-before,.drop-after').forEach(n => n.classList.remove('drop-before','drop-after')); }
function attachDrop(node, index, end = false) {
  const after = event => !end && event.clientX > node.getBoundingClientRect().left + node.getBoundingClientRect().width / 2;
  node.addEventListener('dragover', event => {
    if (!dragId) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; clearDropMarks();
    node.classList.add(after(event) ? 'drop-after' : 'drop-before');
    const scroller = $('counter').parentElement, bounds = scroller.getBoundingClientRect();
    if (event.clientX > bounds.right - 60) scroller.scrollLeft += 30;
    if (event.clientX < bounds.left + 60) scroller.scrollLeft -= 30;
  });
  node.addEventListener('drop', event => {
    event.preventDefault(); clearDropMarks();
    if (!dragId || !catalog.foods.some(f => f.id === dragId)) return;
    moveFood(dragId, index + (after(event) ? 1 : 0)); dragId = null;
  });
}
function renderCounter() {
  const counter = $('counter'); counter.replaceChildren();
  current().foodIds.forEach((id, index) => {
    const food = catalog.foods.find(f => f.id === id), dish = element('article', `dish ${food.container}`);
    dish.dataset.foodId = id; dish.setAttribute('aria-label', `Position ${index + 1}: ${food.displayName}`);
    dish.append(element('span','position',index+1));
    const pan = element('div','pan'); pan.append(thumbnail(food)); dish.append(pan,element('h3','dish-name',food.displayName));
    const controls = element('div','move-buttons');
    const left = button('←', () => { moveFood(id,index-1); focusMove(id,'earlier'); }, `Move ${food.displayName} earlier`);
    const right = button('→', () => { moveFood(id,index+2); focusMove(id,'later'); }, `Move ${food.displayName} later`);
    left.disabled = index === 0; right.disabled = index === current().foodIds.length-1;
    left.dataset.move = 'earlier'; right.dataset.move = 'later';
    controls.append(left,right,button('×', () => { current().foodIds.splice(index,1); changed(); $('counter-title').tabIndex=-1; $('counter-title').focus(); }, `Remove ${food.displayName}`));
    dish.append(controls); attachDrag(dish,id); attachDrop(dish,index); counter.append(dish);
  });
  const end = element('div','drop-end',current().foodIds.length ? '+ Drop a food here' : 'Add your first food from the library');
  end.dataset.dropEnd = ''; attachDrop(end,current().foodIds.length,true); counter.append(end);
}
function focusMove(id, direction) {
  const dish = document.querySelector(`.dish[data-food-id="${id}"]`);
  const preferred = dish.querySelector(`[data-move="${direction}"]`);
  (preferred.disabled ? dish.querySelector('button:not(:disabled)') : preferred).focus();
}
function renderLibrary() {
  const query = $('search').value.trim().toLowerCase(); $('library').replaceChildren();
  for (const food of catalog.foods.filter(f => f.displayName.toLowerCase().includes(query))) {
    const used = current().foodIds.includes(food.id), card = element('article','food-card'); card.dataset.foodId = food.id;
    if (!used) attachDrag(card,food.id);
    card.append(thumbnail(food)); const info = element('div','food-info');
    const add = button(used ? 'On this buffet' : '+ Add to buffet', () => moveFood(food.id,current().foodIds.length), `Add ${food.displayName}`);
    add.disabled = used || current().foodIds.length >= 12;
    info.append(element('strong','',food.displayName),element('p','',`${food.startingServings} servings · ${food.piecesPerServing} ${food.piecesPerServing===1?'piece':'pieces'} per serving`),add);
    card.append(info); $('library').append(card);
  }
  if (!$('library').childElementCount) $('library').append(element('p','hint','No foods match this search.'));
}
function changed() { notice(); save(); renderConditions(); renderCounter(); renderLibrary(); updateReadiness(); }
function render() {
  document.querySelectorAll('button,input,textarea').forEach(node => node.disabled = false);
  $('study-name').value = experiment.studyName; $('instructions').value = experiment.taskInstructions; $('condition-name').value = current().name;
  const rules = catalog.rules;
  $('rules').textContent = `Plate diameter: ${Math.round(rules.plateDiameter*100)} cm. Maximum pile height: ${Math.round(rules.maximumPileHeight*100)} cm. ${rules.totalPortionLimit ? rules.totalPortionLimit+' total portions maximum.' : 'Physical plate capacity limits servings.'} ${rules.allowEmptyPlate ? 'Participants may finish with an empty plate.' : 'At least one portion is required.'}`;
  renderConditions(); renderCounter(); renderLibrary(); updateReadiness();
  document.querySelectorAll('#design input,#design textarea,#design button').forEach(n => { if (recovery) n.disabled=true; });
}
function showDesign() {
  $('preview-host').replaceChildren(); $('preview-panel').hidden = true; $('design').hidden = false;
  $('design-tab').setAttribute('aria-current','page'); $('preview-tab').removeAttribute('aria-current');
}
function showPreview() {
  guard(() => {
    const config = launch('preview'); save(); notice();
    const iframe = document.createElement('iframe'); iframe.title='Buffet condition preview'; iframe.allow='fullscreen'; iframe.src=participantUrl(config);
    $('preview-host').replaceChildren(iframe); $('preview-title').textContent = current().name;
    $('preview-panel').hidden = false; $('design').hidden = true;
    $('preview-tab').setAttribute('aria-current','page'); $('design-tab').removeAttribute('aria-current');
  });
}
for (const [input,key] of [['study-name','studyName'],['instructions','taskInstructions']]) $(input).oninput = () => { experiment[key]=$(input).value; save(); updateReadiness(); };
$('condition-name').oninput = () => { current().name=$('condition-name').value; save(); renderConditions(); updateReadiness(); };
$('search').oninput = renderLibrary;
$('new-study').onclick = () => {
  if (!catalog) return;
  if (!confirm('Start a new experiment? Export a file first if you want to keep the current draft.')) return;
  recovery = null; document.querySelectorAll('#design input,#design textarea,#design button').forEach(n => n.disabled=false);
  notice(); adopt(makeExperiment());
};
$('add-condition').onclick = () => { const c={id:newId('condition'),name:`Condition ${experiment.conditions.length+1}`,foodIds:[]}; experiment.conditions.push(c); selectedId=c.id; render(); save(); };
$('duplicate-condition').onclick = () => { const c=clone(current()); c.id=newId('condition'); c.name=(c.name+' copy').slice(0,80); experiment.conditions.push(c); selectedId=c.id; render(); save(); };
$('delete-condition').onclick = () => { if (experiment.conditions.length===1 || !confirm(`Delete “${current().name}”?`)) return; experiment.conditions=experiment.conditions.filter(c=>c.id!==selectedId); selectedId=experiment.conditions[0].id; render(); save(); };
$('export').onclick = () => guard(() => {
  if (recovery) { download(recovery,'buffet-saved-draft-recovery.json'); return; }
  const e=validateExperiment(experiment,catalog); download(e,`buffet-experiment-${e.studyId}.json`); notice('Experiment file exported. Keep it as a backup or import it on another computer.');
});
$('import').onclick = () => $('file').click();
$('file').onchange = async () => {
  const file=$('file').files[0]; if (!file) return;
  try {
    if (file.size>1000000) throw new Error('Choose an experiment JSON file smaller than 1 MB.');
    const value=validateExperiment(JSON.parse(await file.text()),catalog);
    if (!confirm('Replace this browser’s draft with the imported experiment? Export the current draft first if you want to keep it.')) return;
    document.querySelectorAll('#design input,#design textarea,#design button').forEach(n=>n.disabled=false);
    adopt(value); if (!storageBlocked) notice('Experiment imported. All named conditions are available.');
  } catch(error) { notice('Import failed. Your current draft was preserved. '+error.message); }
  finally { $('file').value=''; }
};
$('copy-link').onclick = async () => {
  try {
    const url=participantUrl(launch('participant')); $('participant-link').value=url;
    try { await navigator.clipboard.writeText(url); notice('Participant link copied. Later edits will not change this link.'); }
    catch { $('link-fallback').hidden=false; $('participant-link').focus(); $('participant-link').select(); notice('Select and copy the participant link below.'); }
  } catch(error) { notice(error.message); }
};
$('preview').onclick=$('preview-tab').onclick=showPreview;
$('design-tab').onclick=$('return-design').onclick=showDesign;
window.addEventListener('beforeunload',event=>{ if(storageBlocked) {event.preventDefault();event.returnValue='';} });
try {
  catalog=await loadCatalog(); experiment=makeExperiment(); selectedId=experiment.conditions[0].id;
  let stored;
  try { stored=localStorage.getItem(storageKey); } catch { storageBlocked=true; }
  if (stored) {
    try { const draft=JSON.parse(stored); experiment=validateExperiment(draft.experiment,catalog); selectedId=experiment.conditions.some(c=>c.id===draft.selectedId)?draft.selectedId:experiment.conditions[0].id; }
    catch(error) { recovery=stored; notice('Saved draft needs attention. '+error.message+' Export file will recover the saved draft. Choose New experiment or import a compatible file to continue.'); }
  }
  render();
  if(recovery) $('save-status').textContent='Saved draft preserved'; else save();
} catch(error) {
  notice(error.message); $('save-status').textContent='Builder unavailable';
  document.querySelectorAll('button,input,textarea').forEach(n=>n.disabled=true);
}
