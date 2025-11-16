function getRecommendations(vitals, profile, activity) {
    const { detak_jantung, kadar_oksigen } = vitals;
    const { umur, riwayat_penyakit } = profile;
    
    const rekomendasi = [];
    
    // Analisis berdasarkan aktivitas terakhir
    if (activity === "aktivitas_berat" && detak_jantung > 100) {
        rekomendasi.push("Detak jantung meningkat karena aktivitas. Istirahat 10-15 menit.");
    } else if (activity === "tidur" && detak_jantung > 90) {
        rekomendasi.push("Detak jantung tinggi saat istirahat. Perlu konsultasi dokter.");
    }
    
    // Rekomendasi khusus berdasarkan riwayat penyakit
    // (Kita asumsikan riwayat_penyakit adalah array: ['hipertensi', 'diabetes'])
    if (riwayat_penyakit.includes("hipertensi") && detak_jantung > 95) {
        rekomendasi.push("Khusus penderita hipertensi: hindari kopi dan makanan asin.");
    }
    if (riwayat_penyakit.includes("diabetes") && kadar_oksigen < 92) {
        rekomendasi.push("Penderita diabetes: periksa gula darah jika sesak napas.");
    }
    if (riwayat_penyakit.includes("jantung") && detak_jantung > 100) {
        rekomendasi.push("Penderita jantung: segera minum obat dan hubungi keluarga!");
    }
    
    // Rekomendasi umum oksigen
    if (kadar_oksigen >= 95) {
        rekomendasi.push("Kadar oksigen baik. Tetap jaga pola napas yang teratur.");
    } else if (kadar_oksigen >= 90) {
        rekomendasi.push("Kadar oksigen menurun. Lakukan latihan pernapasan 5 menit.");
        rekomendasi.push("Duduk tegak dan tarik napas dalam melalui hidung.");
    } else {
        rekomendasi.push("KADAR OKSIGEN KRITIS! Segera hubungi tenaga medis.");
    }
    
    // Rekomendasi detak jantung
    // (Gunakan batas atas yang disesuaikan dengan umur)
    const BATAS_DETAK_ATAS = (umur >= 65) ? 110 : 100;
    
    if (detak_jantung < 60) {
        rekomendasi.push("Detak jantung lambat. Lakukan peregangan ringan setiap jam.");
    } else if (detak_jantung >= 60 && detak_jantung <= 90) {
        rekomendasi.push("Detak jantung ideal. Pertahankan dengan jalan pagi rutin.");
    } else if (detak_jantung > 90 && detak_jantung <= BATAS_DETAK_ATAS) {
        rekomendasi.push("Detak jantung agak tinggi. Kurangi konsumsi kafein.");
    } else { // di atas BATAS_DETAK_ATAS
        rekomendasi.push("Detak jantung sangat tinggi. Kompres dahi dengan air dingin.");
    }
    
    // Rekomendasi gaya hidup
    rekomendasi.push("Tips sehat: minum 8 gelas air sehari dan tidur cukup 7-8 jam.");
    
    return rekomendasi;
}

// Ekspor fungsi ini agar bisa dipakai di server.js
module.exports = { getRecommendations };