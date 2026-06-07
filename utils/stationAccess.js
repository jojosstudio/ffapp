const Station = require('../models/Station');

async function canManageStation(user, stationId) {
    if (!user || !stationId) return false;
    const sid = parseInt(stationId, 10);

    if (user.role === 'super_admin') return true;

    if (user.role === 'zugfuehrer') {
        return user.station_id === sid;
    }

    if (user.role === 'leitstelle') {
        if (!user.city_id) return false;
        const station = await Station.findById(sid);
        return station && station.city_id === user.city_id;
    }

    return false;
}

function getStationRedirect(user, stationId) {
    if (user.role === 'leitstelle') {
        return `/leitstelle/station/${stationId}`;
    }
    return '/admin/station';
}

module.exports = { canManageStation, getStationRedirect };
