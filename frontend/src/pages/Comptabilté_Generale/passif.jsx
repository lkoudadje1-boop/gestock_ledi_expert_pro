import React from 'react';
import { Loader2, ArrowRight } from 'lucide-react';

const BORDEAUX = '#800020';

const PassifTable = ({ passifData, years, loading }) => {
    const formatCur = (val) => val ? new Intl.NumberFormat('fr-FR').format(Math.round(val)) : '0';
    const isTotal = (code) => ['CP', 'DD', 'DF', 'DP', 'DT'].includes(code);

    if (loading) {
        return <div style={centerStyle}><Loader2 className="animate-spin" size={40} color={BORDEAUX} /></div>;
    }

    // On sépare la ligne de total général (DZ) pour l'épingler en bas
    const rows = passifData.filter(row => row.code !== 'DZ');
    const totalRow = passifData.find(row => row.code === 'DZ');

    return (
        <div style={tableCard}>
            <table style={tableStyle}>
                <thead>
                    <tr style={theadPrimary}>
                        <th rowSpan="2" style={thRef}>REF</th>
                        <th rowSpan="2" style={thLibHeader}>DESIGNATION PASSIF</th>
                        <th style={thExHeader}>NET AU 31/12/{years.current}</th>
                        <th style={thExHeader}>NET AU 31/12/{years.prev}</th>
                    </tr>
                    <tr style={theadSecondary}>
                        <th style={thSub}>VALEUR</th>
                        <th style={thSub}>VALEUR</th>
                    </tr>
                </thead>
                <tbody style={tbodyStyle}>
                    {rows.map((row, i) => (
                        <tr key={i} style={isTotal(row.code) ? trT : (i % 2 === 0 ? trEven : trNormal)}>
                            <td style={tdCode}>{row.code}</td>
                            <td style={tdLib}>
                                {isTotal(row.code) && <ArrowRight size={10} style={{marginRight: '5px'}}/>}
                                {row.libelle}
                            </td>
                            <td style={isTotal(row.code) ? tdNetBold : tdMontant}>{formatCur(row.montant_net)}</td>
                            <td style={tdMontant}>{formatCur(row.montant_prec)}</td>
                        </tr>
                    ))}
                </tbody>
                {/* 🎯 LIGNE DE PIED ALIGNÉE SUR L'ACTIF */}
                {totalRow && (
                    <tfoot>
                        <tr style={trGT}>
                            <td style={tdCode}>{totalRow.code}</td>
                            <td style={tdLib}>{totalRow.libelle}</td>
                            <td style={tdNetGT}>{formatCur(totalRow.montant_net)}</td>
                            <td style={tdNetGT}>{formatCur(totalRow.montant_prec)}</td>
                        </tr>
                    </tfoot>
                )}
            </table>
        </div>
    );
};

// --- STYLES MIS À JOUR ---
const tableCard = { 
    background: 'white', 
    borderRadius: '0 0 12px 12px', 
    border: '1px solid #e2e8f0', 
    display: 'flex',
    flexDirection: 'column',
    height: '100%'
};

const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: '10px', flex: 1 };

const thBase = { padding: '8px', border: '1px solid #e2e8f0', background: '#f8fafc', fontWeight: '800', textTransform: 'uppercase' };
const thRef = { ...thBase, width: '40px' };
const thLibHeader = { ...thBase, textAlign: 'left' };
const thExHeader = { ...thBase, background: '#f1f5f9', color: BORDEAUX };
const thSub = { ...thBase, fontSize: '8px' };

const theadPrimary = { background: 'white' };
const theadSecondary = { background: 'white' };

const tbodyStyle = { borderBottom: `2px solid ${BORDEAUX}` };

const trNormal = { height: '30px' };
const trEven = { background: '#fafbfc' };
const trT = { background: '#f1f5f9', fontWeight: '800' };
const trGT = { background: BORDEAUX, color: 'white', fontWeight: '900' };

const tdCode = { padding: '5px', border: '1px solid #e2e8f0', textAlign: 'center', fontWeight: '700' };
const tdLib = { padding: '5px 10px', border: '1px solid #e2e8f0', textAlign: 'left' };
const tdMontant = { padding: '5px 10px', border: '1px solid #e2e8f0', textAlign: 'right', fontFamily: 'monospace' };
const tdNetBold = { ...tdMontant, fontWeight: '800', color: BORDEAUX };
const tdNetGT = { ...tdMontant, color: 'white', border: 'none' };

const centerStyle = { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', background: 'white' };

export default PassifTable;