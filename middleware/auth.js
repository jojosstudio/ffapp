// Authentication middleware
const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        req.flash('error', 'Bitte melde dich zuerst an');
        return res.redirect('/login');
    }
    next();
};

const requireRole = (roles) => {
    return (req, res, next) => {
        if (!req.session.user) {
            req.flash('error', 'Bitte melde dich zuerst an');
            return res.redirect('/login');
        }
        
        const userRole = req.session.user.role;
        const allowedRoles = Array.isArray(roles) ? roles : [roles];
        
        if (!allowedRoles.includes(userRole)) {
            req.flash('error', 'Du hast keine Berechtigung für diese Seite');
            return res.redirect('/dashboard');
        }
        
        next();
    };
};

const requireSuperAdmin = requireRole(['super_admin']);
const requireZugfuehrer = requireRole(['zugfuehrer', 'super_admin']);
const requireLeitstelle = requireRole(['leitstelle', 'super_admin']);
const requireFF = requireRole(['ff', 'zugfuehrer', 'super_admin']);
const requireJF = requireRole(['jf', 'zugfuehrer', 'super_admin']);

const blockLeitstelleFromParticipant = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'leitstelle') {
        req.flash('error', 'Als Leitstelle kannst du nicht an Challenges oder Ranglisten teilnehmen.');
        return res.redirect('/leitstelle');
    }
    next();
};

module.exports = {
    requireAuth,
    requireRole,
    requireSuperAdmin,
    requireZugfuehrer,
    requireLeitstelle,
    requireFF,
    requireJF,
    blockLeitstelleFromParticipant
};
