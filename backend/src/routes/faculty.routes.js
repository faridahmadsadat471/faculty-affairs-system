import { Router } from 'express';
import { createFaculty, getFaculty, listFaculty, updateFaculty } from '../controllers/faculty.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireRoles } from '../middleware/role.middleware.js';
import { validateRequest } from '../middleware/validation.middleware.js';
import { createFacultyValidation, getFacultyValidation, listFacultyValidation, updateFacultyValidation } from '../validators/faculty.validator.js';

const router = Router();

router.get('/', requireAuth, requireRoles('system_admin', 'directorate_staff', 'department_manager', 'faculty_member'), listFacultyValidation, validateRequest, listFaculty);
router.get('/:id', requireAuth, requireRoles('system_admin', 'directorate_staff', 'department_manager', 'faculty_member'), getFacultyValidation, validateRequest, getFaculty);
router.post('/', requireAuth, requireRoles('system_admin', 'directorate_staff'), createFacultyValidation, validateRequest, createFaculty);
router.patch('/:id', requireAuth, requireRoles('system_admin', 'directorate_staff'), updateFacultyValidation, validateRequest, updateFaculty);

export default router;
