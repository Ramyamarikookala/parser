const express = require("express");
const swaggerParser = require("@apidevtools/swagger-parser");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const port = 3006;

const allowedMimeTypes = [
  "application/json",
  "application/x-yaml",
  "text/yaml",
  "text/x-yaml",
];
const allowedExtensions = [".json", ".yaml", ".yml"];

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  },
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const mimeType = file.mimetype;

    if (
      allowedExtensions.includes(extension) &&
      allowedMimeTypes.includes(mimeType)
    ) {
      cb(null, true);
    } else {
      return cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", "swaggerFile"));
    }
  },
});

if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}

app.post("/parse-swagger", upload.single("swaggerFile"), async (req, res, next) => {
  if (!req.file) {
    return res.status(415).json({
      error: "Bad Request: No file uploaded or invalid file type. Only JSON and YAML files are allowed.",
    });
  }

  const filePath = path.join(__dirname, req.file.path);

  try {
    let api;

    try {
      api = await swaggerParser.validate(filePath);
    } catch (parseError) {
      fs.unlinkSync(filePath);
      console.log(parseError);

      if (parseError.name === "SyntaxError") {
        return res.status(400).json({
          error: `Bad Request: Invalid JSON/YAML syntax: ${parseError.message}`,
        });
      } else if (parseError.message.includes("Unsupported")) {
        return res.status(415).json({
          error: `Unsupported Media Type: Unsupported Swagger/OpenAPI version: ${parseError.message}`,
        });
      } else {
        return res.status(422).json({
          error: `Unprocessable Entity: Invalid Swagger/OpenAPI document: ${parseError.message}`,
        });
      }
    }

    const resources = [];
    for (const [path, methods] of Object.entries(api.paths || {})) {
      for (const [method, details] of Object.entries(methods)) {
        resources.push({
          path: path,
          method: method.toUpperCase(),
        });
      }
    }

    fs.unlinkSync(filePath);

    return res.status(200).json(resources);

  } catch (error) {
    fs.unlinkSync(filePath);
    next({
      status: 500,
      message: `Internal Server Error: ${error.message}`,
    });
  }
});

app.use((err, req, res, next) => {
  console.error('Error details:', err);

  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({ error: "Bad Request: Invalid file type. Only JSON and YAML files are allowed." });
    }
    return res.status(400).json({ error: `Bad Request: Multer Error: ${err.message}` });
  }

  if (err.message && err.message.includes("Invalid file type")) {
    return res.status(400).json({ error: `Bad Request: ${err.message}` });
  }

  if (err.status) {
    return res.status(err.status).json({ error: `${err.status} ${err.message}` });
  }

  return res.status(500).json({ error: `Internal Server Error: ${err.message}` });
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
