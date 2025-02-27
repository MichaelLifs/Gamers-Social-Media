
var passport = require('passport')
var { StatusCodes } = require('http-status-codes')
var User = require('../models/user')
var Profile = require('../models/profile')
const { sendResetPasswordMail, hasPasswordResetLink, removePasswordResetLink } = require('../util/reset_password_mail')
var Joi = require('joi')

exports.login = function (req, res, next) {
	passport.authenticate('local', async function (err, user, info) {
		if (err) {
			return next(err)
		}
		// user is invalid
		if (!user) {
			return res.status(StatusCodes.BAD_REQUEST).send(info.message)
		}
		// remember me option
		const { remember_me } = req.body
		if (remember_me) {
			req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000 // session expires after 30 days
		} else {
			req.session.cookie.expires = false // session expires at end of session
		}
		// login
		req.logIn(user, function (err) {
			if (err) {
				return next(err)
			}
			return res.status(StatusCodes.OK).send('logged in successfuly')
		})
	})(req, res, next)
}

exports.signup = async function (req, res, next) {
	const { name, email, password } = req.body
	// validate input
	try {
		const name_validator = Joi.string().min(3).max(64).pattern(/^[a-zA-Z0-9][a-zA-Z0-9 -_'+]+[a-zA-Z0-9]$/)
		Joi.attempt(name, name_validator)
		const email_validator = Joi.string().email()
		Joi.attempt(email, email_validator)
		const password_validator = Joi.string().alphanum().length(64)
		Joi.attempt(password, password_validator)
	} catch (err) {
		return res.status(StatusCodes.BAD_REQUEST).send('name, email or password are not formatted correctly')
	}
	// check that the email is not being used already
	try {
		const user = await User.findOne({ email }).exec()
		if (user) {
			return res.status(StatusCodes.BAD_REQUEST).send('email is being used already')
		}
	} catch (err) {
		return next(err)
	}
	// signup
	try {
		let user = new User({ email })
		user.setPassword(password)
		const { _id } = await user.save()
		let profile = new Profile({ userId: _id, name })
		await profile.save()
		return res.status(StatusCodes.OK).send('signup was successful')
	} catch (err) {
		return next(err)
	}
}

exports.request_password_reset = async function (req, res, next) {
	const { email } = req.query
	try {
		// check if user exist
		if (!email || !await User.findOne({ email }).exec()) {
			return res.status(StatusCodes.BAD_REQUEST).send('email dose not exist')
		}
		// send reset link to email
		sendResetPasswordMail(email)
		return res.status(StatusCodes.OK).send('password reset mail sent')
	} catch (err) {
		return next(err)
	}
}

exports.reset_password = async function (req, res, next) {
	const { code } = req.query
	const { password } = req.body
	let email = hasPasswordResetLink(code)
	// check code exist
	if (!code || !email) {
		return res.status(StatusCodes.BAD_REQUEST).send('password reset code dose not exist or has been expired')
	}
	// check password exist
	if (!password) {
		return res.status(StatusCodes.BAD_REQUEST).send('password is required')
	}
	// change password
	try {
		removePasswordResetLink(code)
		let user = await User.findOne({ email }).exec()
		user.setPassword(password)
		await user.save()
		return res.status(StatusCodes.OK).send('password changed')
	} catch (err) {
		return next(err)
	}
}

exports.is = function (req, res) {
	if (req.user) {
		return res.status(StatusCodes.OK).send('yes')
	} else {
		return res.status(StatusCodes.OK).send('no')
	}
}

exports.logout = function (req, res) {
	req.logout()
	return res.sendStatus(StatusCodes.OK)
}

exports.profile = async function (req, res, next) {
	try {
		const id = req.user.id,
			email = req.user.email
		const profile = await Profile.findOne({ userId: id }).exec()
		return res.status(StatusCodes.OK).send({ id, name: profile.name, email })
	} catch (err) {
		next(err)
	}
}

