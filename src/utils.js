function maskPhone(p) {
  if (!p || p.length < 6) return "***";
  return p.slice(0, 4) + "****" + p.slice(-2);
}

module.exports = { maskPhone };
