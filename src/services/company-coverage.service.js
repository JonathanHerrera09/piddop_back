const AppError = require('../utils/app-error');

function normalizeCoordinatePoint(point) {
  if (!point || typeof point !== 'object') {
    return null;
  }

  const latitude = Number(point.latitude ?? point.lat);
  const longitude = Number(point.longitude ?? point.lng ?? point.lon);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }

  return { latitude, longitude };
}

function normalizeCoveragePolygon(polygon) {
  if (!polygon) {
    return null;
  }

  if (!Array.isArray(polygon)) {
    throw new AppError('coverage_polygon must be an array of coordinates', 422);
  }

  const normalized = polygon
    .map((point) => normalizeCoordinatePoint(point))
    .filter(Boolean);

  if (normalized.length < 3) {
    throw new AppError('coverage_polygon must contain at least 3 valid points', 422);
  }

  return normalized;
}

function pointInPolygon(point, polygon) {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].longitude;
    const yi = polygon[i].latitude;
    const xj = polygon[j].longitude;
    const yj = polygon[j].latitude;

    const intersect =
      yi > point.latitude !== yj > point.latitude &&
      point.longitude < ((xj - xi) * (point.latitude - yi)) / ((yj - yi) || Number.EPSILON) + xi;

    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}

function assertPointWithinCompanyCoverage({ company, latitude, longitude }) {
  if (!company?.coverage_enabled) {
    return;
  }

  const polygon = normalizeCoveragePolygon(company.coverage_polygon);

  if (!polygon) {
    throw new AppError('This company has coverage enabled but no polygon configured', 409);
  }

  if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) {
    throw new AppError('Selected address must include map coordinates', 422);
  }

  if (
    !pointInPolygon(
      { latitude: Number(latitude), longitude: Number(longitude) },
      polygon
    )
  ) {
    throw new AppError('This address is outside the company coverage area', 422);
  }
}

module.exports = {
  assertPointWithinCompanyCoverage,
  normalizeCoveragePolygon,
  pointInPolygon
};
