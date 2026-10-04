const AppError = require('../utils/app-error');
const { getGlobalCoverageSetting } = require('./platform-setting.service');
const { pointInPolygon } = require('./company-coverage.service');

async function assertPointWithinGlobalCoverage({ latitude, longitude }) {
  const coverage = await getGlobalCoverageSetting();

  if (!coverage.enabled || coverage.polygon.length < 3) {
    return;
  }

  const point = {
    latitude: Number(latitude),
    longitude: Number(longitude)
  };

  if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) {
    throw new AppError('La direccion seleccionada no tiene coordenadas validas.', 422);
  }

  if (!pointInPolygon(point, coverage.polygon)) {
    throw new AppError('La direccion esta fuera de la cobertura general configurada para la vereda.', 422);
  }
}

module.exports = {
  assertPointWithinGlobalCoverage
};
