require("dotenv").config();
const express = require("express");
const path = require("path");
const hbs = require("hbs");
const app = express();
const port = 5000;
const { calcProjectDuration } = require("./assets/js/utils");
const Project = require("./models").projects;
const User = require("./models").users;
const bcrypt = require("bcrypt");
const session = require("cookie-session");
const flash = require("express-flash");
const cookieParser = require("cookie-parser");
const moment = require("moment");
const multer = require("multer");
const storage = multer.memoryStorage(); // setting multer
const upload = multer({ storage });
const cloudinary = require('cloudinary').v2; // setting cloudinary
// cloudinary config
cloudinary.config({
	cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
	api_key: process.env.CLOUDINARY_API_KEY,
	api_secret: process.env.CLOUDINARY_API_SECRET,
});
// function upload cloudinary
const uploadToCloudinary = (file) => {
	return new Promise((resolve, reject) => {
		cloudinary.uploader.upload_stream({
			folder: "upload-img-personal-web",
			tranformation: [
				{width: 1200, crop: "limit"},
				{quality: "auto"},
				{fetch_format: "auto"}
			]
		},
		(error, result) => {
			if (error) {
				reject(error);
			} else {
				resolve(result)
			}
		}).end(file.buffer);
	})
}

// data untuk cekbox
const techData = [
	{
		name: "Node.Js",
		key: "node",
	},
	{
		name: "Express.Js",
		key: "express",
	},
	{
		name: "React.Js",
		key: "react",
	},
	{
		name: "Next.Js",
		key: "next",
	},
	{
		name: "Typescript",
		key: "typescript",
	},
	{
		name: "Others",
		key: "others",
	},
];

// block request for error vercel 
app.get('/favicon.ico', (req, res) => res.status(204));
app.get('/favicon.png', (req, res) => res.status(204));

app.set("view engine", "hbs");
app.set("views", path.join(__dirname, "views"));
app.use("/assets", express.static(path.join(__dirname, "assets")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.urlencoded({ extended: false }));
app.use(express.json()); // data untuk parsing objek
app.use(
	session({
		name: "my-session",
		secret: "u94eSa7gzu",
		resave: false,
		saveUninitialized: true,
		cookie: {
			maxAge: 1000 * 60 * 60 * 24,
			secure: false,
		},
	})
);
app.use(flash());
app.use(cookieParser());

// setting helpers
hbs.registerPartials(path.join(__dirname, "views", "partials"));
hbs.registerHelper("isExist", function (array, value) {
	return array.includes(value);
});
hbs.registerHelper("getTechName", function (value) {
	const result = techData.find((tech) => tech.key === value);
	return result ? result.name : "";
});
hbs.registerHelper("formatDate", function (date) {
	return moment(date).format("YYYY-MM-DD");
});
hbs.registerHelper("isOwner", function (sessionUserId, projectUserId, options) {
	if (sessionUserId === projectUserId) {
		return options.fn(this);
	} else {
		return options.inverse(this);
	}
});

// Routing html
app.get("/", home);
app.get("/add-project", addProjectView);
app.post("/add-project", upload.single("uploadImage"), addProjectPost);
app.get("/edit-project/:id", editProjectView);
app.post("/edit-project/:id", upload.single("uploadImage"), editProject);
app.get("/delete-project/:id", deleteProject);
app.get("/detail-project/:id", detailProject);
app.get("/contact-me", contactMe);
app.get("/testimoni", testimoni);
app.get("/register", registerView);
app.post("/register", register);
app.get("/login", loginView);
app.post("/login", login);
app.get("/logout", logout);

async function home(req, res) {
	try {
		const result = await Project.findAll({
			order: [["createdAt", "DESC"]],
		});
		const user = req.session.user;

		const resultWithUser = result.map((item) => ({
			...item.dataValues,
			user: user,
		}));

		res.render("index", { result: resultWithUser, user });
	} catch (error) {
		req.flash("danger", "Something went wrong");
		res.redirect("/");
	}
}

async function addProjectView(req, res) {
	try {
		const tech = techData;
		const user = req.session.user;
		const messageWarning = req.cookies.warning;
		res.clearCookie("warning");

		if (!user) {
			res.cookie("warning", "You're must login to continue!", {
				httpOnly: true,
				maxAge: 5000,
			});
			return res.redirect("login");
		}

		res.render("add-project", { tech, user, messageWarning });
	} catch (error) {
		req.flash("error", "Something went wrong!");
		return res.redirect("/");
	}
}

async function addProjectPost(req, res) {
	try {
		const { inputTitle, startDate, endDate, technologies, description } =
			req.body;
		const imageFile = req.file;

		const result = await uploadToCloudinary(imageFile);
		const imageUrl = result.secure_url;

		const techArray = Array.isArray(technologies)
			? technologies
			: technologies.split(",");
		const duration = calcProjectDuration(startDate, endDate);

		const newProject = await Project.create({
			title: inputTitle,
			startDate: startDate,
			endDate: endDate,
			technologies: techArray,
			description: description,
			image: imageUrl,
			duration: duration,
			userId: req.session.user.id,
		});

		req.flash("success", "Adding project successful!");
		res.redirect("/");
	} catch (error) {
		req.flash("error", "Something went wrong!");
		return res.redirect("/");
	}
}

async function editProjectView(req, res) {
	try {
		const { id } = req.params;
		const user = req.session.user;

		const result = await Project.findOne({
			where: {
				id: id,
			},
		});

		const tech = techData;

		if (!result) {
			req.flash("error", "Project not found");
			return res.redirect("/", user);
		}

		res.render("edit-project", { result, tech });
	} catch (error) {
		req.flash("error", "Something went wrong!");
		return res.redirect("/");
	}
}

async function editProject(req, res) {
	try {
		const { id } = req.params;
		const {
			inputTitle,
			startDate,
			endDate,
			technologies,
			description,
			existingImageURL,
		} = req.body;

		const duration = calcProjectDuration(startDate, endDate);

		const project = await Project.findOne({
			where: {
				id: id,
			},
		});

		if (!project) {
			req.flash("error", "Project not found");
			return res.redirect("/");
		}

		project.title = inputTitle;
		project.startDate = startDate;
		project.endDate = endDate;
		project.technologies = technologies;
		project.description = description;

		let imageUrl = project.image; // gambar existing

		if (req.file) {
			const publicId = imageUrl.split('/').slice(-2).join('/').split('.')[0];

			// menghapus gambar lama di cloudinary
			await cloudinary.uploader.destroy(publicId, (error, result) => {
				if (error){
					console.log("Error deleting old image, ", error);
				} else {
					console.log("Image deleted from cloudinary, ", result);
				}
			});
			const result = await uploadToCloudinary(req.file);
			imageUrl = result.secure_url;
		} 

		project.image = imageUrl;
		project.duration = duration;

		await project.save();

		req.flash("success", "Edit successfull!");
		res.redirect("/");
	} catch (error) {
		req.flash("error", "Something went wrong!");
		return res.redirect("/");
	}
}

async function deleteProject(req, res) {
	try {
		const { id } = req.params;
		let result = await Project.findOne({
			where: {
				id: id,
			},
		});

		if (!result) {
			req.flash("error", "Project not found");
			return res.redirect("/");
		}

		const imageUrl = result.image;
		const publicId = imageUrl.split('/').slice(-2).join('/').split('.')[0];

		await cloudinary.uploader.destroy(publicId, async(error, result) => {
			if (error) {
				req.flash("Error deleting image from cloudinary");
				console.log("Error delete iamge cloudinary: ",error);
				return res.status(500).send("Failed delete image from Cloudinary");
			}
			console.log("Image deleted from Cloudinary ", result);

			await Project.destroy({
				where: {
					id: id,
				},
			});

			req.flash("success", "Project deleted successfully");
			res.redirect("/");
		});
	} catch (error) {
		req.flash("error", "Something went wrong!");
		return res.redirect("/");
	}
}

async function detailProject(req, res) {
	try {
		const { id } = req.params;
		const user = req.session.user;

		const result = await Project.findOne({
			where: {
				id: id,
			},
			include: [
				{
					model: User,
					as: "user",
					attributes: ["id", "name", "email"],
				},
			],
		});

		if (!result) {
			req.flash("error", "Project not found");
			return res.redirect("/");
		}

		res.render("detail-project", { result, user });
	} catch (error) {
		req.flash("error", "Something went wrong!");
		return res.redirect("/");
	}
}

function contactMe(req, res) {
	const user = req.session.user;
	res.render("get-in-touch", { user });
}

function testimoni(req, res) {
	const user = req.session.user;
	res.render("testimoni", { user });
}

function registerView(req, res) {
	res.render("register");
}

async function register(req, res) {
	try {
		const { name, email, password } = req.body;

		const existingEmail = await User.findOne({
			where: {
				email: email,
			},
		});

		if (existingEmail) {
			req.flash("error", "Email already exist");
			return res.redirect("register");
		}

		const saltRounds = 10;
		const hashedPass = await bcrypt.hash(password, saltRounds);

		await User.create({
			name: name,
			email: email,
			password: hashedPass,
		});

		req.flash("success", "Register Successful!");
		res.redirect("login");
	} catch (error) {
		req.flash("error", "Something went wrong!");
		return res.redirect("register");
	}
}

function loginView(req, res) {
	const messageWarning = req.cookies.warning;
	res.clearCookie("warning");

	res.render("login", { messageWarning });
}

async function login(req, res) {
	try {
		const { email, password } = req.body;

		const user = await User.findOne({
			where: {
				email: email,
			},
		});

		if (!user) {
			req.flash("error", "User not found");
			return res.redirect("/login");
		}

		const isValidPass = await bcrypt.compare(password, user.password);

		if (!isValidPass) {
			req.flash("error", "Check again youre email or password");
			return res.redirect("/login");
		}

		// menyimpan data user tanpa password ke session
		const userWithoutPass = { ...user.get(), password: undefined };
		req.session.user = userWithoutPass;

		req.flash("success", "Login Successful!");
		res.redirect("/");
	} catch (error) {
		req.flash("error", "Something went wrong");
		res.redirect("/login");
	}
}

function logout(req, res) {
	try {
		res.cookie("warning", "You're Logged out, Please Login to Continue!", {
			httpOnly: true,
			maxAge: 5000,
		});

		// Hapus session user apabila menggunakan express-session
		// req.session.destroy((err) => {
		// 	if (err) {
		// 		req.flash("error", "Logout failed, Try again!");
		// 		return res.redirect("/");
		// 	}

		// 	res.redirect("/login");
		// });

		req.session = null;
		res.redirect("/login");
	} catch (error) {
		console.log("Error logout bang, ", error);
		req.flash("error", "Something went wrong");
		res.redirect("/");
	}
}

app.listen(port, () => {
	console.log(`Server sedang berjalan di port ${port}`);
});
