// src/utils/printTemplates.js

export const generateInvoiceHTML = (data, format = 'ticket') => {
  const isTicket = format === 'ticket';
  const companyName = localStorage.getItem('companyName') || 'LEDI EXPERT PRO';

  // Style spécifique selon le format
  const style = isTicket ? `
    <style>
      body { width: 72mm; font-family: 'Courier New', monospace; font-size: 12px; margin: 0; padding: 5px; }
      .center { text-align: center; }
      .bold { font-weight: bold; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      th { border-bottom: 1px dashed #000; text-align: left; }
      td { padding: 2px 0; }
      .total { border-top: 1px double #000; margin-top: 10px; padding-top: 5px; font-size: 14px; }
      .footer { margin-top: 15px; font-size: 10px; text-align: center; }
    </style>
  ` : `
    <style>
      body { font-family: Arial, sans-serif; padding: 40px; }
      .header { display: flex; justify-content: space-between; border-bottom: 2px solid #333; padding-bottom: 10px; }
      table { width: 100%; border-collapse: collapse; margin-top: 30px; }
      th { background: #f4f4f4; border: 1px solid #ddd; padding: 10px; }
      td { border: 1px solid #ddd; padding: 10px; }
      .total-box { margin-top: 20px; text-align: right; font-size: 18px; font-weight: bold; }
    </style>
  `;

  const rows = data.items.map(item => `
    <tr>
      <td>${item.designation.substring(0, 20)}</td>
      <td>${item.qty}</td>
      <td>${item.price.toLocaleString()}</td>
      <td style="text-align:right">${(item.qty * item.price).toLocaleString()}</td>
    </tr>
  `).join('');

  return `
    <html>
      <head>${style}</head>
      <body>
        <div class="center">
          <h2 class="bold">${companyName}</h2>
          <p>Facture #${data.id}<br>${new Date().toLocaleString()}</p>
        </div>
        
        <table>
          <thead>
            <tr>
              <th>Art.</th><th>Qté</th><th>P.U</th><th style="text-align:right">Total</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        <div class="total">
          <div style="display:flex; justify-content:space-between">
            <span class="bold">TOTAL NET:</span>
            <span class="bold">${data.total.toLocaleString()} FCFA</span>
          </div>
        </div>

        <div class="footer">
          <p>Merci de votre visite !<br>Vendeur: ${data.vendeur}</p>
        </div>
      </body>
    </html>
  `;
};