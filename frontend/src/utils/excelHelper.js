import * as XLSX from 'xlsx';
import axios from 'axios'; // 💡 Importez axios

export const exportToExcel = async (data, fileName, tableConcernee, description) => {
  // 1. Génération du fichier Excel (existant)
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
  XLSX.writeFile(workbook, `${fileName}.xlsx`);

  // 2. 💡 AJOUT : Envoyer l'audit au backend 💡
  try {
    await axios.post('/api/audit/log-export', {
      tableConcernee,
      description
    }, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } // 💡 Important pour l'auth
    });
  } catch (error) {
    console.error("Erreur enregistrement audit log", error);
  }
};

export const importFromExcel = (file, callback) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    const data = e.target.result;
    const workbook = XLSX.read(data, { type: 'binary' });
    const sheetName = workbook.SheetNames[0];
    const json = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
    callback(json);
  };
  reader.readAsBinaryString(file);
};