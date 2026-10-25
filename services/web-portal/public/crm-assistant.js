(() => {
  const host = document.getElementById('tools');
  if (!host) return;
  const el = (tag, text) => { const n = document.createElement(tag); if (text) n.textContent = text; return n; };
  const section = el('section'); section.style.cssText = 'border-top:1px solid #DFE6F0;margin-top:24px;padding-top:20px';
  section.append(el('h2', 'Nyrava AI · Call preparation'));
  section.append(el('p', 'Prepare suggestions using this authorized lead and your CRM notes. Review every draft before use.'));
  const generate = el('button', 'Analyze lead & prepare follow-up'); generate.type = 'button';
  const output = el('div'); output.setAttribute('aria-live', 'polite');
  section.append(generate, output); host.append(section);
  const complaint = el('section'); complaint.append(el('h2', 'Report an invalid lead'));
  const reason = el('textarea'); reason.maxLength = 2000; reason.setAttribute('aria-label','Describe the lead issue');
  const report = el('button', 'Send issue for Admin review'); report.type = 'button';
  const reportStatus = el('p'); reportStatus.setAttribute('role','status');
  complaint.append(reason, report, reportStatus, el('p', 'Super Admin personally reviews and selects any replacement. Replacements are never automatic.')); host.append(complaint);
  async function post(path, body) {
    const response = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
    const data = await response.json(); if (!response.ok) throw Error(data.error || 'Request failed'); return data;
  }
  generate.onclick = async () => {
    if (!selected) return;
    const id = selected; generate.disabled = true; output.textContent = 'Preparing…';
    try {
      const result = await post(`/api/crm/leads/${id}/assistant`, {});
      output.replaceChildren(); if (selected !== id) { output.textContent='The selected lead changed. Prepare again for the current lead.'; return; }
      if (!result.available) { output.textContent = result.message; return; }
      output.append(el('p', result.warning), el('h3','Analysis · AI suggestion'), el('p',result.analysis));
      const source = result.facts; output.append(el('h3','Source: consumer report'), el('p',source.statement));
      for (const note of source.crmNotes || []) output.append(el('p','CRM note: '+note.details));
      output.append(el('h3','Talking points · suggested questions')); const list = el('ul');
      for (const point of result.talkingPoints) list.append(el('li',point)); output.append(list);
      const draft = el('textarea'); draft.value = result.followUpDraft; draft.setAttribute('aria-label','AI follow-up draft for review'); draft.rows=6;
      const use = el('button','Use reviewed draft in email editor'); use.type='button';
      use.onclick=()=>{ if(selected!==id) return; document.getElementById('crmEmailBody').value=draft.value; };
      const action = el('input'); action.value=result.nextAction; action.maxLength=200; action.setAttribute('aria-label','Reviewed next action');
      const due = el('input'); due.type='datetime-local'; due.setAttribute('aria-label','Next action due date');
      const record=el('button','Approve & record follow-up task'); record.type='button'; const status=el('p'); status.setAttribute('role','status');
      record.onclick=async()=>{ if(selected!==id) return; try { if(!due.value) throw Error('Choose a due date.'); record.disabled=true; await post(`/api/crm/leads/${id}/tasks`,{title:action.value,dueAt:new Date(due.value).toISOString()}); status.textContent='Follow-up task recorded. No consumer message was sent.'; }catch(e){status.textContent=e.message;}finally{record.disabled=false;} };
      output.append(el('h3','Follow-up draft · review before sending'),draft,use,el('h3','Recommended next action · review and schedule'),action,due,record,status);
    } catch(e) { output.textContent=e.message; } finally {generate.disabled=false;}
  };
  report.onclick=async()=>{ if(!selected)return; report.disabled=true; try { const r=await post(`/api/crm/leads/${selected}/complaint`,{reason:reason.value}); reportStatus.textContent=r.message; reason.value=''; }catch(e){reportStatus.textContent=e.message;}finally{report.disabled=false;} };
  // Invalidate drafts whenever the selected contact changes.
  document.getElementById('contacts')?.addEventListener('click',()=>{output.replaceChildren();reason.value='';reportStatus.textContent='';});
})();
