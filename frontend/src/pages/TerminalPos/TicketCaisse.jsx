import React, { forwardRef } from 'react';

/**
 * Composant TicketCaisse
 * Utilise forwardRef pour permettre à useReactToPrint d'accéder au DOM du ticket.
 */
const TicketCaisse = forwardRef(({ panier, total, recu, monnaie, idLot }, ref) => {
    return (
        <div style={{ display: 'none' }}> {/* Masqué sur l'écran principal */}
            <div 
                ref={ref} 
                style={{ 
                    width: '80mm', 
                    padding: '5mm', 
                    fontFamily: '"Courier New", Courier, monospace',
                    color: '#000',
                    backgroundColor: '#fff'
                }}
            >
                {/* Style CSS pour forcer la netteté à l'impression */}
                <style>
                    {`
                        @media print {
                            @page { size: 80mm auto; margin: 0; }
                            body { margin: 0; }
                        }
                    `}
                </style>

                <h2 style={{ textAlign: 'center', margin: '0 0 5px 0', fontSize: '18px' }}>MA BOUTIQUE</h2>
                <p style={{ textAlign: 'center', fontSize: '12px', margin: '0' }}>
                    {new Date().toLocaleString('fr-FR')}
                </p>
                <p style={{ textAlign: 'center', fontSize: '11px', marginBottom: '10px' }}>
                    LOT: {idLot}
                </p>
                
                <div style={{ borderTop: '1px dashed #000', margin: '5px 0' }}></div>

                {/* En-tête colonnes */}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 'bold' }}>
                    <span>Article</span>
                    <span>Total</span>
                </div>
                
                <div style={{ borderTop: '1px dashed #000', margin: '5px 0' }}></div>

                {/* Liste des articles */}
                {panier.map((item, i) => (
                    <div key={i} style={{ marginBottom: '5px', fontSize: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ textTransform: 'uppercase' }}>
                                {item.nom_article_snap.substring(0, 20)}
                            </span>
                            <span>{item.montant_ttc_ligne.toLocaleString()} F</span>
                        </div>
                        <div style={{ fontSize: '10px', fontStyle: 'italic' }}>
                            {item.qte_vendue} x {item.prix_vente_unitaire.toLocaleString()} F
                            {item.remise_montant > 0 && ` (Remise: -${item.remise_montant.toLocaleString()})`}
                        </div>
                    </div>
                ))}

                <div style={{ borderTop: '1px dashed #000', margin: '5px 0' }}></div>

                {/* Totaux */}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '900', fontSize: '16px', margin: '10px 0' }}>
                    <span>TOTAL</span>
                    <span>{total.toLocaleString()} F</span>
                </div>

                <div style={{ fontSize: '13px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Reçu:</span>
                        <span>{Number(recu).toLocaleString()} F</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                        <span>Monnaie:</span>
                        <span>{monnaie > 0 ? monnaie.toLocaleString() : 0} F</span>
                    </div>
                </div>

                <div style={{ borderTop: '1px dashed #000', margin: '15px 0 5px 0' }}></div>
                
                <p style={{ textAlign: 'center', fontSize: '11px', margin: '0' }}>
                    Merci de votre confiance !
                </p>
                <p style={{ textAlign: 'center', fontSize: '9px', marginTop: '5px' }}>
                    Logiciel de Gestion v1.0
                </p>
            </div>
        </div>
    );
});

export default TicketCaisse;