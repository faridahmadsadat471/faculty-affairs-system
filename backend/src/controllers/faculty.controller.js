import { matchedData } from 'express-validator';
import Faculty from '../models/faculty.model.js';
import User from '../models/user.model.js';
import { getFacultyReadFilter } from '../services/faculty-access.service.js';

const facultyReadFields = '_id employeeId user fullName department academicRank email phone employmentStatus education employmentHistory createdAt updatedAt';

export async function listFaculty(req, res, next) {
  try {
    const { page = 1, limit = 20 } = matchedData(req, { locations: ['query'] });
    const filter = await getFacultyReadFilter(req.user);
    const [faculty, total] = await Promise.all([
      Faculty.find(filter)
        .select(facultyReadFields)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Faculty.countDocuments(filter),
    ]);

    res.status(200).json({
      faculty,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
}

export async function getFaculty(req, res, next) {
  try {
    const { id } = matchedData(req, { locations: ['params'] });
    const filter = await getFacultyReadFilter(req.user);
    const faculty = await Faculty.findOne({ _id: id, ...filter })
      .select(facultyReadFields)
      .lean();

    if (!faculty) {
      return res.status(404).json({ message: 'Faculty not found' });
    }

    return res.status(200).json({ faculty });
  } catch (error) {
    next(error);
  }
}

export async function createFaculty(req, res, next) {
  try {
    const data = matchedData(req, { locations: ['body'] });

    if (data.user && !(await User.exists({ _id: data.user }))) {
      return res.status(404).json({ message: 'Linked user not found' });
    }

    const faculty = await Faculty.create(data);
    return res.status(201).json({ message: 'Faculty created successfully', faculty });
  } catch (error) {
    handleFacultyWriteError(error, res, next);
  }
}

export async function updateFaculty(req, res, next) {
  try {
    const { id } = matchedData(req, { locations: ['params'] });
    const data = matchedData(req, { locations: ['body'] });
    const faculty = await Faculty.findById(id).select(`${facultyReadFields} __v`);

    if (!faculty) {
      return res.status(404).json({ message: 'Faculty not found' });
    }

    if (data.user && !(await User.exists({ _id: data.user }))) {
      return res.status(404).json({ message: 'Linked user not found' });
    }

    faculty.set(data);
    await faculty.save();

    return res.status(200).json({
      message: 'Faculty updated successfully',
      faculty: faculty.toObject({ versionKey: false }),
    });
  } catch (error) {
    handleFacultyWriteError(error, res, next);
  }
}

function handleFacultyWriteError(error, res, next) {
  if (error.name === 'VersionError') {
    return res.status(409).json({ message: 'Faculty was changed by another request. Reload it and try again' });
  }

  if (error.code === 11000) {
    const message = error.keyPattern?.user
      ? 'This user is already linked to a faculty profile'
      : 'A faculty profile with this employee ID already exists';
    return res.status(409).json({ message });
  }

  if (error.name === 'ValidationError') {
    return res.status(400).json({
      message: 'Validation failed',
      errors: Object.entries(error.errors).map(([field, issue]) => ({
        field,
        message: issue.name === 'CastError'
          ? 'Invalid value type or date'
          : issue.kind === 'required'
            ? 'This field is required'
            : issue.kind === 'user defined'
              ? issue.message
              : 'Invalid field value',
      })),
    });
  }

  next(error);
}
