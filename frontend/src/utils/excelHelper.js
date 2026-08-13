// frontend/src/utils/excelHelper.js
import * as XLSX from 'xlsx';
import API from '../services/api'; // 🚀 Utilisation de ton instance Axios centralisée

export const exportToExcel = async (data, fileName, tableConcernee, description) => {
  // 1. Génération du fichier Excel
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
  XLSX.writeFile(workbook, `${fileName}.xlsx`);

  // 2. Envoi de l'audit au backend via ton instance API sécurisée
  try {
    await API.post('/audit/log-export', {
      tableConcernee,
      description
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