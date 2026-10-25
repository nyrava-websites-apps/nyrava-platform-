// Nyrava Web Portal Client Logic
document.addEventListener('DOMContentLoaded', () => {
  const valuationForm = document.getElementById('valuationForm');
  const valuationModal = document.getElementById('valuationModal');
  const closeModal = document.getElementById('closeModal');
  const btnDoneValuation = document.getElementById('btnDoneValuation');
  const leadCaptureForm = document.getElementById('leadCaptureForm');
  const stepLeadCapture = document.getElementById('stepLeadCapture');
  const stepResults = document.getElementById('stepResults');

  let pendingPropertyData = null;

  // Auto-adapt links if hosted on non-localhost
  const host = window.location.hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') {
    const crmLink = document.getElementById('crm-portal-link');
    const crmCta = document.getElementById('crm-cta-link');
    const meetLink = document.getElementById('meet-service-link');

    // If on home.nyrava.com or custom domain
    if (crmLink) crmLink.href = `${window.location.protocol}//crm.${host.replace('home.', '')}`;
    if (crmCta) crmCta.href = `${window.location.protocol}//crm.${host.replace('home.', '')}`;
    if (meetLink) meetLink.href = `${window.location.protocol}//meet.${host.replace('home.', '')}`;
  }

  // Handle Initial Valuation Calculation Click
  valuationForm.addEventListener('submit', (e) => {
    e.preventDefault();

    pendingPropertyData = {
      address: document.getElementById('address').value.trim(),
      city: document.getElementById('city').value.trim(),
      state: document.getElementById('state').value.trim().toUpperCase(),
      zipCode: document.getElementById('zipCode').value.trim(),
      bedrooms: parseInt(document.getElementById('bedrooms').value, 10),
      bathrooms: parseFloat(document.getElementById('bathrooms').value),
      squareFeet: parseInt(document.getElementById('squareFeet').value, 10)
    };

    // Open Modal at Step 1: Lead capture
    stepLeadCapture.hidden = false;
    stepResults.hidden = true;
    valuationModal.hidden = false;
  });

  // Close Modal
  const hideModal = () => {
    valuationModal.hidden = true;
  };

  closeModal.addEventListener('click', hideModal);
  btnDoneValuation.addEventListener('click', hideModal);
  valuationModal.addEventListener('click', (e) => {
    if (e.target === valuationModal) hideModal();
  });

  // Handle Lead Verification & Unlock Results
  leadCaptureForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const btn = document.getElementById('btnUnlockValuation');
    btn.disabled = true;
    btn.innerHTML = '<span>&#8987; Generating Valuation Report...</span>';

    const payload = {
      ...pendingPropertyData,
      leadName: document.getElementById('leadName').value.trim(),
      leadEmail: document.getElementById('leadEmail').value.trim(),
      leadPhone: document.getElementById('leadPhone').value.trim()
    };

    try {
      // Send to valuation API (either proxy /api/valuation or direct :5190)
      let apiUrl = '/api/valuation/evaluate';
      let res;
      try {
        res = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } catch (err) {
        // Fallback to port 5190 directly
        apiUrl = `http://${window.location.hostname}:5190/api/v1/valuation/evaluate`;
        res = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server responded with ${res.status}`);
      }

      const data = await res.json();
      displayResults(data.valuationReport || data, payload);

    } catch (err) {
      alert(`Could not complete valuation: ${err.message}. Please check your connection or contact support.`);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span>Unlock Report &amp; View Valuation &rarr;</span>';
    }
  });

  function displayResults(report, req) {
    const val = report.valuation || report;
    const est = val.estimatedValue || val.estimate || 0;
    const low = val.valuationRange?.low || val.lowRange || Math.round(est * 0.94);
    const high = val.valuationRange?.high || val.highRange || Math.round(est * 1.06);
    const conf = val.confidenceScore || val.confidence || '94%';
    const ppsqft = val.pricePerSquareFoot || val.pricePerSqFt || Math.round(est / (req.squareFeet || 1800));
    const eq = report.equityProjection?.estimated3YearGain || val.projected3YearEquityGain || Math.round(est * 0.14);
    const trend = val.annualMarketGrowthRate || report.equityProjection?.annualAppreciationRate || 4.8;
    const comps = report.comparableSales || val.comparableSales || [];

    document.getElementById('resAddress').innerText = `${req.address}, ${req.city}, ${req.state} ${req.zipCode}`;
    document.getElementById('resEstimatedValue').innerText = `$${est.toLocaleString()}`;
    document.getElementById('resRangeLow').innerText = `Low: $${low.toLocaleString()}`;
    document.getElementById('resRangeHigh').innerText = `High: $${high.toLocaleString()}`;
    document.getElementById('resConfidence').innerText = `${conf} Confidence`;
    document.getElementById('resPricePerSqFt').innerText = `$${ppsqft}/sqft`;
    document.getElementById('resEquity').innerText = `+$${eq.toLocaleString()}`;
    document.getElementById('resTrend').innerText = `+${trend}% / yr`;

    const compsList = document.getElementById('compsList');
    compsList.innerHTML = '';
    comps.forEach(comp => {
      const el = document.createElement('div');
      el.className = 'comp-item';
      const price = comp.salePrice || comp.price || 0;
      const addr = comp.address || comp.street || 'Nearby Comparable Home';
      const dist = comp.distanceMiles || '0.3';
      const days = comp.daysAgo || '14';
      const b = comp.beds || 3;
      const ba = comp.baths || 2;

      el.innerHTML = `
        <div>
          <strong>${addr}</strong>
          <span style="color:#64748b; margin-left:8px;">${dist} mi away · ${b}b/${ba}ba</span>
        </div>
        <div>
          <strong style="color:#073b2b;">$${price.toLocaleString()}</strong>
          <span style="color:#94a3b8; font-size:0.75rem; margin-left:6px;">(${days}d ago)</span>
        </div>
      `;
      compsList.appendChild(el);
    });

    stepLeadCapture.hidden = true;
    stepResults.hidden = false;
  }
});
