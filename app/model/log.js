const { Model, DataTypes } = require("sequelize");
const sequelize = require("./dbconfig");

class Log extends Model {}

Log.init(
	{
		id: {
			type: DataTypes.INTEGER,
			primaryKey: true,
		},
		data: {
      type: DataTypes.TEXT,
      allowNull:true,
    },
		key: {
      type: DataTypes.STRING,
      allowNull:true,
    },
		type: {
      type: DataTypes.STRING,
      allowNull:true,
    },
	},
	{
		sequelize,
		modelName: "log",
		timestamps: true,
	}
);

module.exports = Log;
