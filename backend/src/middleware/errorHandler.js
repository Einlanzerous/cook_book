export function errorHandler(err, req, res, next) {
  console.error('Error:', err);

  if (err.code === 'P2002') {
    // No `field`: which unique column collided would tell an anonymous caller
    // whether an email or external id is already registered.
    return res.status(409).json({
      error: 'A record with this value already exists'
    });
  }

  // Foreign key violation (e.g. a contributorId that does not exist, or deleting
  // a contributor that still owns recipes: ON DELETE RESTRICT).
  if (err.code === 'P2003') {
    return res.status(409).json({
      error: 'This record is referenced by, or refers to, a record that does not allow it',
      field: err.meta?.field_name
    });
  }

  if (err.code === 'P2025') {
    return res.status(404).json({
      error: 'Record not found'
    });
  }

  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
}
