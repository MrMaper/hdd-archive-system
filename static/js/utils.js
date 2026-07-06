// Jalaali (Shamsi) date conversion utilities

function toJalali(dateInput) {
  if (!dateInput) return "";
  var d;
  if (typeof dateInput === "string") {
    d = new Date(dateInput);
  } else if (dateInput instanceof Date) {
    d = dateInput;
  } else {
    return "";
  }
  if (isNaN(d.getTime())) return dateInput;

  var gYear = d.getFullYear();
  var gMonth = d.getMonth() + 1;
  var gDay = d.getDate();

  var gDaysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  var jDaysInMonth = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29];

  function isGregorianLeap(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  }

  var gy = gYear - 1600;
  var gm = gMonth - 1;
  var gd = gDay - 1;

  var gDayNo =
    365 * gy +
    Math.floor((gy + 3) / 4) -
    Math.floor((gy + 99) / 100) +
    Math.floor((gy + 399) / 400);

  for (var i = 0; i < gm; i++) {
    gDayNo += gDaysInMonth[i];
  }
  if (gm > 1 && isGregorianLeap(gYear)) {
    gDayNo++;
  }
  gDayNo += gd;

  var jDayNo = gDayNo - 79;
  var jNp = Math.floor(jDayNo / 12053);
  jDayNo = jDayNo % 12053;
  var jy = 979 + 33 * jNp + 4 * Math.floor(jDayNo / 1461);
  jDayNo = jDayNo % 1461;

  if (jDayNo >= 366) {
    jy += Math.floor((jDayNo - 1) / 365);
    jDayNo = (jDayNo - 1) % 365;
  }

  var jm = 0;
  var jd = 0;
  for (var k = 0; k < 12; k++) {
    if (jDayNo < jDaysInMonth[k]) {
      jm = k + 1;
      jd = jDayNo + 1;
      break;
    }
    jDayNo -= jDaysInMonth[k];
  }

  var persianMonths = [
    "فروردین",
    "اردیبهشت",
    "خرداد",
    "تیر",
    "مرداد",
    "شهریور",
    "مهر",
    "آبان",
    "آذر",
    "دی",
    "بهمن",
    "اسفند",
  ];

  return jd + " " + persianMonths[jm - 1] + " " + jy;
}

function toJalaliDateTime(dateInput) {
  var datePart = toJalali(dateInput);
  if (!datePart) return "";
  if (!dateInput) return "";

  // If the input has a "T", extract the time directly from the ISO string
  // to avoid timezone-related issues (server stores without timezone).
  if (typeof dateInput === "string" && dateInput.indexOf("T") !== -1) {
    // Format: "2026-07-06T14:30:45" or "2026-07-06T14:30:45+03:30"
    var timePart = dateInput.split("T")[1] || "";
    // Strip any timezone offset at the end (+03:30 or Z)
    timePart = timePart.replace(/[+-]\d{2}:\d{2}$/, "").replace(/Z$/, "");
    var parts = timePart.split(":");
    if (parts.length >= 2) {
      var h = parseInt(parts[0], 10);
      var m = parseInt(parts[1], 10);
      if (!isNaN(h) && !isNaN(m)) {
        var hourStr = (h < 10 ? "0" : "") + h;
        var minStr = (m < 10 ? "0" : "") + m;
        return datePart + " — " + hourStr + ":" + minStr;
      }
    }
  }

  // Fallback for dates without time: return date only
  return datePart;
}

function toJalaliNumeric(dateInput) {
  if (!dateInput) return "";
  var d;
  if (typeof dateInput === "string") {
    d = new Date(dateInput);
  } else if (dateInput instanceof Date) {
    d = dateInput;
  } else {
    return "";
  }
  if (isNaN(d.getTime())) return dateInput;

  var gYear = d.getFullYear();
  var gMonth = d.getMonth() + 1;
  var gDay = d.getDate();

  var gDaysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  var jDaysInMonth = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29];

  function isGregorianLeap(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  }

  var gy = gYear - 1600;
  var gm = gMonth - 1;
  var gd = gDay - 1;

  var gDayNo =
    365 * gy +
    Math.floor((gy + 3) / 4) -
    Math.floor((gy + 99) / 100) +
    Math.floor((gy + 399) / 400);

  for (var i = 0; i < gm; i++) {
    gDayNo += gDaysInMonth[i];
  }
  if (gm > 1 && isGregorianLeap(gYear)) {
    gDayNo++;
  }
  gDayNo += gd;

  var jDayNo = gDayNo - 79;
  var jNp = Math.floor(jDayNo / 12053);
  jDayNo = jDayNo % 12053;
  var jy = 979 + 33 * jNp + 4 * Math.floor(jDayNo / 1461);
  jDayNo = jDayNo % 1461;

  if (jDayNo >= 366) {
    jy += Math.floor((jDayNo - 1) / 365);
    jDayNo = (jDayNo - 1) % 365;
  }

  var jm = 0;
  var jd = 0;
  for (var k = 0; k < 12; k++) {
    if (jDayNo < jDaysInMonth[k]) {
      jm = k + 1;
      jd = jDayNo + 1;
      break;
    }
    jDayNo -= jDaysInMonth[k];
  }

  var jmStr = String(jm);
  if (jmStr.length < 2) jmStr = "0" + jmStr;
  var jdStr = String(jd);
  if (jdStr.length < 2) jdStr = "0" + jdStr;
  return jy + "/" + jmStr + "/" + jdStr;
}

// Convert English digits to Persian digits
function toPersianDigits(num) {
  var id = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return num.toString().replace(/[0-9]/g, function (w) { return id[w]; });
}

// Detect if a string is primarily Latin (English) characters
function isLatin(str) {
  if (!str) return false;
  // Count Latin vs non-Latin characters
  var latinCount = 0;
  var nonLatinCount = 0;
  for (var i = 0; i < str.length; i++) {
    var code = str.charCodeAt(i);
    // Basic Latin + Latin-1 Supplement (excluding control chars)
    if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a) || (code >= 0xc0 && code <= 0xff)) {
      latinCount++;
    } else if (code > 0x7f) {
      // non-ASCII, non-Latin (e.g. Persian, Arabic, CJK)
      nonLatinCount++;
    }
  }
  // If more than half of the non-whitespace characters are Latin, return true
  return latinCount > nonLatinCount && latinCount > 2;
}
