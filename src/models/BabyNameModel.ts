import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/DatabaseConfig.js';


class BabyName extends Model {}

BabyName.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    sex: {
      type: DataTypes.ENUM('M', 'F'),
      allowNull: false,
    },
  },
  {
    sequelize,              // connection instance
    modelName: 'BabyName',
    tableName: 'BabyNames', 
    timestamps: true,       // createdAt / updatedAt columns
    indexes: [
      {
        fields: ['name', 'sex'],
        name: 'idx_name_sex',
      },
    ],
  }
);

export default BabyName;