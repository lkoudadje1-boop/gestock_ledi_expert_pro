import React, { useState, useEffect } from 'react';
import { Loader2, Printer, FileText, Play, Layout, Download, CheckSquare, Square, X, Calendar, AlertCircle, CheckCircle } from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import API from '../../services/api';
import PassifTable from './passif';
import ExcelJS from 'exceljs'; 
import { saveAs } from 'file-saver';

const BORDEAUX = '#800020';

const EtatsFinanciersRecap = () => {
    const [loading, setLoading] = useState(false);
    const [exercices, setExercices] = useState([]);
    const [exerciceId, setExerciceId] = useState('');
    const [years, setYears] = useState({ current: 'N', prev: 'N-1' });

    const [dateDebut, setDateDebut] = useState('');
    const [dateFin, setDateFin] = useState('');

    const [toasts, setToasts] = useState([]);
    const addToast = (message, type = 'success') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
    };

    const [bilanData, setBilanData] = useState({ actif: [], passif: [] });
    const [crData, setCrData] = useState([]);
    const [tftData, setTftData] = useState([]);

    const [showExportPanel, setShowExportPanel] = useState(false);
    const [exportSelections, setExportSelections] = useState({
        bilan: true,
        cr: true,
        tft: true
    });

    useEffect(() => {
        const init = async () => {
            try {
                const res = await API.get('/plan-comptable/exercices/liste');
                const list = res.data.data || [];
                setExercices(list);
                const activeEx = list.find(ex => ex.statut === 'OUVERT') || list[0];
                if (activeEx) {
                    setExerciceId(activeEx.id);
                    setDateDebut(activeEx.date_debut.split('T')[0]);
                    setDateFin(activeEx.date_fin.split('T')[0]);
                    const yr = new Date(activeEx.date_debut).getFullYear();
                    setYears({ current: yr, prev: yr - 1 });
                }
            } catch (err) { 
                addToast("Erreur lors de l'initialisation", "error"); 
            }
        };
        init();
    }, []);

    const handleExerciceChange = (e) => {
        const id = e.target.value;
        setExerciceId(id);
        const ex = exercices.find(item => String(item.id) === String(id));
        if (ex) {
            setDateDebut(ex.date_debut.split('T')[0]);
            setDateFin(ex.date_fin.split('T')[0]);
            const yr = new Date(ex.date_debut).getFullYear();
            setYears({ current: yr, prev: yr - 1 });
        }
    };

    const generateAllReports = async () => {
        if (!exerciceId) return addToast("Sélectionnez un exercice", "error");
        setLoading(true);
        addToast("Génération des états en cours...");
        try {
            const params = { exerciceId, dateDebut, dateFin };
            const [resA, resP, resCR, resTFT] = await Promise.all([
                API.get('/compta/rapports/bilan', { params }),
                API.get('/compta/rapports/bilan-passif', { params }),
                API.get('/compta/rapports/compte-resultat', { params }),
                API.get('/compta/rapports/tft', { params })
            ]);
            setBilanData({ actif: resA.data.actif || [], passif: resP.data.passif || [] });
            setCrData(resCR.data.data || []);
            setTftData(resTFT.data.data || []);
            addToast("États financiers générés !");
        } catch (err) { 
            addToast("Erreur lors de la génération", "error"); 
        } finally { setLoading(false); }
    };

    const handleExportExcel = async () => {
        const workbook = new ExcelJS.Workbook();
        const bordeauxClean = BORDEAUX.replace('#', 'FF');

        const styleSheet = (sheet, title, headers) => {
            sheet.mergeCells('A1:F1');
            const titleCell = sheet.getCell('A1');
            titleCell.value = `${title} AU ${new Date(dateFin).toLocaleDateString()}`;
            titleCell.font = { name: 'Arial Black', size: 14, color: { argb: bordeauxClean } };
            titleCell.alignment = { horizontal: 'center' };

            const headerRow = sheet.getRow(3);
            headerRow.values = headers;
            headerRow.height = 30;
            headerRow.eachCell((cell) => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bordeauxClean } };
                cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
                cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
            });
            sheet.columns = headers.map((h, i) => ({ width: i === 1 ? 12 : 55 }));
        };

        const addDataRows = (sheet, data, type) => {
            data.forEach((row) => {
                let values = type === 'ACTIF' 
                    ? [row.code, row.libelle, row.montant_brut, row.montant_amort, row.montant_net, row.montant_prec]
                    : [row.code, row.libelle, (row.montant_net || row.montant_n), row.montant_prec];
                
                const r = sheet.addRow(values);
                const isTotal = row.code === 'BZ' || row.code === 'DZ' || (row.code && (row.code.startsWith('X') || row.code.startsWith('Z') || row.code === 'BT'));

                r.eachCell((cell, col) => {
                    if (col > 2) { cell.numFmt = '#,##0'; cell.alignment = { horizontal: 'right' }; }
                    cell.border = { bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
                    
                    if (isTotal) {
                        cell.font = { bold: true, color: { argb: row.code.startsWith('Z') || row.code === 'BZ' ? 'FFFFFFFF' : 'FF000000' } };
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: row.code.startsWith('Z') || row.code === 'BZ' ? bordeauxClean : 'FFF1F5F9' } };
                    }
                });
            });
        };

        if (exportSelections.bilan) {
            const wsA = workbook.addWorksheet('BILAN ACTIF');
            styleSheet(wsA, 'BILAN ACTIF', ["REF", "DESIGNATION", "BRUT", "AMORT", "NET N", "NET N-1"]);
            addDataRows(wsA, bilanData.actif, 'ACTIF');
            const wsP = workbook.addWorksheet('BILAN PASSIF');
            styleSheet(wsP, 'BILAN PASSIF', ["REF", "DESIGNATION PASSIF", "NET N", "NET N-1"]);
            addDataRows(wsP, bilanData.passif, 'AUTRE');
        }
        if (exportSelections.cr) {
            const wsCR = workbook.addWorksheet('RESULTAT');
            styleSheet(wsCR, 'COMPTE DE RESULTAT', ["REF", "LIBELLÉS", "NET N", "NET N-1"]);
            addDataRows(wsCR, crData, 'AUTRE');
        }
        if (exportSelections.tft) {
            const wsTFT = workbook.addWorksheet('TFT');
            styleSheet(wsTFT, 'FLUX DE TRESORERIE', ["REF", "LIBELLÉS", "FLUX N", "FLUX N-1"]);
            addDataRows(wsTFT, tftData, 'AUTRE');
        }

        const buffer = await workbook.xlsx.writeBuffer();
        saveAs(new Blob([buffer]), `Etats_Financiers_${dateFin}.xlsx`);
    };

    const formatCur = (val, isTFT = false, code = "") => {
        if (val === null || val === undefined) return isTFT && code === "" ? "" : "0";
        const num = Math.round(val);
        const absVal = Math.abs(num);
        const formatted = new Intl.NumberFormat('fr-FR').format(absVal);
        if (isTFT) {
            if (code === 'ZA' || code === 'ZH' || (code && code.startsWith('Z'))) return num < 0 ? `(${formatted})` : formatted;
            return num > 0 ? `+ ${formatted}` : num < 0 ? `- ${formatted}` : '0';
        }
        return formatted;
    };

    const toggleSelection = (key) => setExportSelections(prev => ({ ...prev, [key]: !prev[key] }));

    const handleAction = async (type) => {
        if (Object.values(exportSelections).filter(v => v).length === 0) return addToast("Sélectionnez au moins un tableau.", "error");
        if (type === 'PRINT') {
            addToast("Préparation de l'impression...");
            setTimeout(() => window.print(), 1000);
        } else if (type === 'EXCEL') {
            handleExportExcel();
        }
    };

    return (
        <div style={layoutStyle}>
            {/* 🎯 LOGIQUE D'IMPRESSION CORRIGÉE : 1 TABLEAU = 1 PAGE PDF */}
            <style>
                {`
                @media print {
                    /* Annuler les scrolls de l'interface écran pour l'impression */
                    html, body, #root, main, div { 
                        height: auto !important; 
                        overflow: visible !important; 
                    }
                    aside, header, .no-print, .export-panel { display: none !important; }
                    
                    main { margin: 0 !important; padding: 0 !important; width: 100% !important; }
                    #print-area { width: 100% !important; display: block !important; }

                    /* Empiler les tableaux verticalement pour le PDF */
                    .dual-view-print { display: block !important; }
                    
                    /* FORÇAGE DES SAUTS DE PAGE */
                    .printable-section {
                        page-break-before: always !important;
                        break-before: page !important;
                        display: block !important;
                        width: 100% !important;
                        margin: 0 !important;
                        padding-top: 20px !important;
                    }
                    /* Pas de saut de page pour la toute première page */
                    .printable-section:first-child { page-break-before: avoid !important; break-before: avoid !important; }

                    .table-card { border: 1px solid #000 !important; box-shadow: none !important; }
                    table { width: 100% !important; page-break-inside: auto; }
                    tr { page-break-inside: avoid; page-break-after: auto; }
                    thead { display: table-header-group; }
                }
                `}
            </style>

            <div style={toastContainer} className="no-print">
                {toasts.map(t => (
                    <div key={t.id} style={{...toastItem, borderLeft: `5px solid ${t.type === 'error' ? '#ef4444' : '#10b981'}`}}>
                        {t.type === 'error' ? <AlertCircle size={18} color="#ef4444" /> : <CheckCircle size={18} color="#10b981" />}
                        <span style={{fontSize: '12px', fontWeight: '800'}}>{t.message}</span>
                        <X size={14} style={{cursor: 'pointer', marginLeft: 'auto'}} onClick={() => setToasts(prev => prev.filter(item => item.id !== t.id))} />
                    </div>
                ))}
            </div>

            <Sidebar />
            <main style={mainStyle}>
                <header style={headerStyle} className="no-print">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={iconBox}><Layout color="white" size={24} /></div>
                        <div>
                            <h1 style={titleStyle}>ÉTATS FINANCIERS RÉCAPITULATIFS</h1>
                            <div style={subTitle}>SYSTÈME NORMAL • RÉFÉRENTIEL SYSCOHADA</div>
                        </div>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                        <select style={selectSmall} value={exerciceId} onChange={handleExerciceChange}>
                            {exercices.map(ex => <option key={ex.id} value={ex.id}>{ex.libelle}</option>)}
                        </select>
                        <div style={dateRangeContainer}>
                            <input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} style={dateInput} />
                            <span style={{fontWeight: 'bold', color: '#64748b', fontSize: '10px'}}>AU</span>
                            <input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} style={dateInput} />
                        </div>
                        <button onClick={generateAllReports} style={btnGenerate} disabled={loading}>
                            {loading ? <Loader2 className="animate-spin" size={18} /> : <Play size={18} fill="white" />}
                            <span style={{marginLeft: '10px'}}>GÉNÉRER</span>
                        </button>
                        <button onClick={() => setShowExportPanel(!showExportPanel)} style={btnSecondary}>
                            <Download size={18} />
                            <span style={{marginLeft: '8px'}}>EXPORTER</span>
                        </button>
                    </div>
                </header>

                {showExportPanel && (
                    <div style={exportPanel} className="no-print">
                        <div style={{display: 'flex', alignItems: 'center', gap: '20px'}}>
                            <label style={checkboxLabel} onClick={() => toggleSelection('bilan')}>
                                {exportSelections.bilan ? <CheckSquare size={18} color={BORDEAUX} /> : <Square size={18} />}
                                <span>BILAN</span>
                            </label>
                            <label style={checkboxLabel} onClick={() => toggleSelection('cr')}>
                                {exportSelections.cr ? <CheckSquare size={18} color={BORDEAUX} /> : <Square size={18} />}
                                <span>RÉSULTAT</span>
                            </label>
                            <label style={checkboxLabel} onClick={() => toggleSelection('tft')}>
                                {exportSelections.tft ? <CheckSquare size={18} color={BORDEAUX} /> : <Square size={18} />}
                                <span>TFT</span>
                            </label>
                        </div>
                        <div style={{display: 'flex', gap: '10px'}}>
                            <button onClick={() => handleAction('PRINT')} style={btnActionGreen}><Printer size={16} /> IMPRIMER PDF</button>
                            <button onClick={() => handleAction('EXCEL')} style={btnActionBlue}><FileText size={16} /> EXCEL BORDEAUX</button>
                            <button onClick={() => setShowExportPanel(false)} style={btnNoBg}><X size={18} /></button>
                        </div>
                    </div>
                )}

                <div style={scrollArea}>
                    <div id="print-area">
                        <div id="section-bilan" style={{opacity: exportSelections.bilan ? 1 : 0.4}}>
                            <div style={sectionTitle}>1. BILAN AU {new Date(dateFin).toLocaleDateString()}</div>
                            <div style={dualViewContainer} className="dual-view-print">
                                {/* PAGE 1 PDF : ACTIF */}
                                <div style={tableSection} className="table-section-print">
                                    <div style={tableHeaderTitle}>ACTIF</div>
                                    <div style={tableCard} className="table-card">
                                        <table style={tableStyle}>
                                            <thead>
                                                <tr style={theadPrimary}>
                                                    <th rowSpan="2" style={thRef}>REF</th>
                                                    <th rowSpan="2" style={thLibHeader}>DESIGNATION</th>
                                                    <th colSpan="3" style={thExHeader}>{years.current}</th>
                                                    <th style={thExHeader}>{years.prev}</th>
                                                </tr>
                                                <tr style={theadSecondary}>
                                                    <th style={thSub}>BRUT</th><th style={thSub}>AMORT</th><th style={thSub}>NET</th><th style={thSub}>NET</th>
                                                </tr>
                                            </thead>
                                            <tbody style={{borderBottom: `2px solid ${BORDEAUX}`}}>
                                                {bilanData.actif.filter(r => r.code !== 'BZ').map((row, i) => (
                                                    <tr key={i} style={['AD', 'AI', 'AP', 'AQ', 'AZ', 'BK', 'BT'].includes(row.code) ? trT : (i % 2 === 0 ? trEven : trNormal)}>
                                                        <td style={tdCode}>{row.code}</td>
                                                        <td style={tdLib}>{row.libelle}</td>
                                                        <td style={tdMontant}>{formatCur(row.montant_brut)}</td>
                                                        <td style={tdMontant}>{formatCur(row.montant_amort)}</td>
                                                        <td style={['AD', 'AI', 'AP', 'AQ', 'AZ', 'BK', 'BT'].includes(row.code) ? tdNetBold : tdMontant}>{formatCur(row.montant_net)}</td>
                                                        <td style={tdMontant}>{formatCur(row.montant_prec)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot>
                                                {bilanData.actif.filter(r => r.code === 'BZ').map((row) => (
                                                    <tr key="total-actif" style={trGT}>
                                                        <td style={tdCode}>{row.code}</td>
                                                        <td style={tdLib}>{row.libelle}</td>
                                                        <td style={tdNetGT}>{formatCur(row.montant_brut)}</td>
                                                        <td style={tdNetGT}>{formatCur(row.montant_amort)}</td>
                                                        <td style={tdNetGT}>{formatCur(row.montant_net)}</td>
                                                        <td style={tdNetGT}>{formatCur(row.montant_prec)}</td>
                                                    </tr>
                                                ))}
                                            </tfoot>
                                        </table>
                                    </div>
                                </div>

                                {/* PAGE 2 PDF : PASSIF */}
                                <div style={tableSection} className="table-section-print pdf-page-break">
                                    <div style={tableHeaderTitle}>PASSIF</div>
                                    <PassifTable passifData={bilanData.passif} years={years} loading={loading} />
                                </div>
                            </div>
                        </div>

                        {/* PAGE 3 PDF : CR */}
                        <div style={{marginTop: '40px'}} className="pdf-page-break">
                            <div style={sectionTitle}>2. PERFORMANCE & FLUX</div>
                            <div style={dualViewContainer} className="dual-view-print">
                                <div style={{...tableSection, opacity: exportSelections.cr ? 1 : 0.4}} className="table-section-print">
                                    <div style={tableHeaderTitle}>COMPTE DE RÉSULTAT</div>
                                    <div style={tableCard} className="table-card">
                                        <table style={tableStyle}>
                                            <thead>
                                                <tr style={theadPrimary}>
                                                    <th style={thRef}>REF</th><th style={thLibHeader}>LIBELLÉS</th>
                                                    <th style={thExHeader}>NET {years.current}</th><th style={thExHeader}>NET {years.prev}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {crData.map((row, i) => (
                                                    <tr key={i} style={row.code.startsWith('X') ? trT : (i % 2 === 0 ? trEven : trNormal)}>
                                                        <td style={tdCode}>{row.code}</td>
                                                        <td style={tdLib}>{row.libelle}</td>
                                                        <td style={row.code.startsWith('X') ? tdNetBold : tdMontant}>{formatCur(row.montant_n)}</td>
                                                        <td style={tdMontant}>{formatCur(row.montant_prec)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* PAGE 4 PDF : TFT */}
                                <div style={{...tableSection, opacity: exportSelections.tft ? 1 : 0.4}} className="table-section-print pdf-page-break">
                                    <div style={tableHeaderTitle}>FLUX DE TRÉSORERIE (TFT)</div>
                                    <div style={tableCard} className="table-card">
                                        <table style={tableStyle}>
                                            <thead>
                                                <tr style={theadPrimary}>
                                                    <th style={thRef}>REF</th><th style={thLibHeader}>LIBELLÉS</th>
                                                    <th style={thExHeader}>FLUX {years.current}</th><th style={thExHeader}>FLUX {years.prev}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {tftData.map((row, i) => (
                                                    <tr key={i} style={row.code === "" ? trHeader : (row.code.startsWith('Z') || row.code === 'ZA' || row.code === 'ZH' || row.code === 'BFR' ? trT : (i % 2 === 0 ? trEven : trNormal))}>
                                                        <td style={tdCode}>{row.code}</td>
                                                        <td style={tdLib}>{row.libelle}</td>
                                                        <td style={(row.code.startsWith('Z') || row.code === 'ZA' || row.code === 'ZH' || row.code === 'BFR') ? tdNetBold : tdMontant}>{formatCur(row.montant_n, true, row.code)}</td>
                                                        <td style={tdMontant}>{formatCur(row.montant_prec, true, row.code)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

// --- STYLES (INCHANGÉS POUR L'INTERFACE ÉCRAN) ---
const toastContainer = { position: 'fixed', top: '25px', right: '25px', zIndex: 10000, display: 'flex', flexDirection: 'column', gap: '10px' };
const toastItem = { background: 'white', padding: '12px 20px', borderRadius: '8px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', gap: '12px', minWidth: '280px', animation: 'slideIn 0.3s ease-out' };
const dateRangeContainer = { display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', padding: '5px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' };
const dateInput = { border: 'none', background: 'transparent', fontSize: '11px', fontWeight: 'bold', color: BORDEAUX, outline: 'none', cursor: 'pointer' };
const layoutStyle = { display: 'flex', height: '100vh', background: '#f0f2f5', overflow: 'hidden' };
const mainStyle = { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' };
const headerStyle = { background: 'white', padding: '10px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `4px solid ${BORDEAUX}`, flexShrink: 0, zIndex: 100 };
const scrollArea = { flex: 1, overflowY: 'auto', padding: '20px 40px' };
const exportPanel = { background: '#fff', padding: '10px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', animation: 'slideDown 0.3s ease-out' };
const checkboxLabel = { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', color: '#475569', userSelect: 'none' };
const btnActionGreen = { background: '#10b981', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' };
const btnActionBlue = { background: '#3b82f6', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' };
const btnNoBg = { background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' };
const sectionTitle = { fontSize: '16px', fontWeight: '900', color: BORDEAUX, marginBottom: '15px', borderLeft: `5px solid ${BORDEAUX}`, paddingLeft: '15px' };
const dualViewContainer = { display: 'flex', gap: '20px', alignItems: 'stretch' };
const tableSection = { display: 'flex', flexDirection: 'column', flex: 1, transition: 'opacity 0.3s' };
const tableHeaderTitle = { background: BORDEAUX, color: 'white', textAlign: 'center', padding: '8px', fontWeight: '800', fontSize: '11px', borderRadius: '8px 8px 0 0' };
const tableCard = { background: 'white', borderRadius: '0 0 12px 12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', height: '100%' };
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: '10px', flex: 1 };
const iconBox = { background: BORDEAUX, padding: '8px', borderRadius: '10px' };
const titleStyle = { margin: 0, fontSize: '18px', fontWeight: '900', color: BORDEAUX };
const subTitle = { fontSize: '11px', color: '#64748b', fontWeight: '600' };
const selectSmall = { padding: '5px 10px', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '11px', fontWeight: 'bold' };
const btnGenerate = { background: BORDEAUX, color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: '900', cursor: 'pointer', display: 'flex', alignItems: 'center' };
const btnSecondary = { background: 'white', color: BORDEAUX, border: `1px solid ${BORDEAUX}`, padding: '10px 15px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', fontWeight: 'bold', fontSize: '11px' };
const thBase = { padding: '8px', border: '1px solid #e2e8f0', fontWeight: '800', textTransform: 'uppercase', background: '#f8fafc' };
const thRef = { ...thBase, width: '40px' };
const thLibHeader = { ...thBase, textAlign: 'left' };
const thExHeader = { ...thBase, background: '#f1f5f9', color: BORDEAUX };
const thSub = { ...thBase, fontSize: '8px' };
const theadPrimary = { background: 'white' };
const theadSecondary = { background: 'white' };
const trNormal = { height: '30px' };
const trEven = { background: '#fafbfc' };
const trT = { background: '#f1f5f9', fontWeight: '800' };
const trHeader = { background: '#f1f5f9', fontWeight: '800', color: '#1e293b' };
const trGT = { background: BORDEAUX, color: 'white', fontWeight: '900' };
const tdCode = { padding: '5px', border: '1px solid #e2e8f0', textAlign: 'center', fontWeight: '700' };
const tdLib = { padding: '5px 10px', border: '1px solid #e2e8f0', textAlign: 'left' };
const tdMontant = { padding: '5px 10px', border: '1px solid #e2e8f0', textAlign: 'right', fontFamily: 'monospace' };
const tdNetBold = { ...tdMontant, fontWeight: '800', color: BORDEAUX };
const tdNetGT = { ...tdMontant, color: 'white', border: 'none' };

export default EtatsFinanciersRecap;