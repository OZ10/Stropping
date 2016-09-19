package com.adapters.database;
import android.content.Context;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.util.Log;

/**
 * Created by Austen on 15/08/2016.
 */
public class DatabaseHelper extends SQLiteOpenHelper{
    //TABLE NAMES
    public static final String TABLE_INGREDIENTS = "ingredients";
    public static final String TABLE_SHOPPINGLIST = "shoppinglist";
    public static final String TABLE_RECIPES = "recipes";
    public static final String TABLE_RECIPEINGREDIENTS = "recipeingredients";
    public static final String TABLE_UOM = "uom";
    public static final String TABLE_INGREDIENTCATEGORIES = "ingredientsCategories";

    //COLUMN NAMES
    public static final String COLUMN_ID = "_id";
    public static final String COLUMN_INGREDIENTID = "ingredient_id";
    public static final String COLUMN_RECIPEID = "recipe_id";
    public static final String COLUMN_INGREDIENTNAME = "ingredientName";
    public static final String COLUMN_CATEGORY = "ingredientCategory";
    public static final String COLUMN_CATEGORYNAME = "categoryName";
    public static final String COLUMN_UOM = "uom";
    public static final String COLUMN_DEFAULTVALUE = "defaultvalue";
    public static final String COLUMN_FAVOURITE = "favourite";
    public static final String COLUMN_ESSENTIAL = "essential";
    public static final String COLUMN_HIDDEN = "hidden";
    public static final String COLUMN_QUANTITY = "quantity";
    public static final String COLUMN_ADDED = "added";
    public static final String COLUMN_PURCHASED = "purchased";
    public static final String COLUMN_RECIPENAME = "recipeName";
    public static final String COLUMN_RECIPEIMAGE = "recipeImage";
    public static final String COLUMN_RECIPESERVES = "recipeServes";
    public static final String COLUMN_RECIPENOTES = "recipeNotes";

    private static final String DATABASE_NAME = "stropping.db";
    private static final int DATABASE_VERSION = 2;

    //Database creation SQL
    private static final String TABLE_INGREDIENTS_CREATE = "create table "
            + TABLE_INGREDIENTS + "(" + COLUMN_ID + " integer primary key autoincrement, " +
            COLUMN_INGREDIENTNAME + " text not null, " +
            COLUMN_UOM + " text not null, " +
            COLUMN_DEFAULTVALUE + " INTEGER, " +
            COLUMN_FAVOURITE + " INTEGER, " +
            COLUMN_ESSENTIAL + " INTEGER, " +
            COLUMN_QUANTITY + " INTEGER, " +
            COLUMN_ADDED + " INTEGER, " +
            COLUMN_HIDDEN + " INTEGER, " +
            COLUMN_CATEGORY + " TEXT);";

    private static final String TABLE_SHOPPINGLIST_CREATE = "create table "
            + TABLE_SHOPPINGLIST + "(" + COLUMN_ID + " integer primary key autoincrement, " +
            COLUMN_INGREDIENTID + " INTEGER, " +
            COLUMN_QUANTITY + " INTEGER, " +
            COLUMN_PURCHASED + " INTEGER);";

    private static final String TABLE_RECIPES_CREATE = "create table "
            + TABLE_RECIPES + "(" + COLUMN_ID + " integer primary key autoincrement, " +
            COLUMN_RECIPENAME + " text not null, " +
            COLUMN_RECIPEIMAGE + " text not null, " +
            COLUMN_RECIPESERVES + " INTEGER, " +
            COLUMN_RECIPENOTES + " text not null);";

    private static final String TABLE_RECIPEINGREDIENTS_CREATE = "create table "
            + TABLE_RECIPEINGREDIENTS + "(" + COLUMN_ID + " integer primary key autoincrement, " +
            COLUMN_RECIPEID + " INTEGER, " +
            COLUMN_INGREDIENTID + " INTEGER, " +
            COLUMN_QUANTITY + " INTEGER);";

    private static final String TABLE_UOM_CREATE = "create table "
            + TABLE_UOM + "(" + COLUMN_ID + " integer primary key autoincrement, " +
            COLUMN_UOM + " text not null);";

    private static final String TABLE_INGREDIENTCATEGORIES_CREATE = "create table "
            + TABLE_INGREDIENTCATEGORIES + "(" + COLUMN_ID + " integer primary key autoincrement, " +
            COLUMN_CATEGORYNAME + " text not null);";

    public DatabaseHelper(Context context) {
        super(context, DATABASE_NAME, null, DATABASE_VERSION);
        // TODO Auto-generated constructor stub
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL(TABLE_INGREDIENTS_CREATE);
        db.execSQL(TABLE_SHOPPINGLIST_CREATE);
        db.execSQL(TABLE_RECIPES_CREATE);
        db.execSQL(TABLE_RECIPEINGREDIENTS_CREATE);
        db.execSQL(TABLE_UOM_CREATE);
        db.execSQL(TABLE_INGREDIENTCATEGORIES_CREATE);
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        int w = Log.w(DatabaseHelper.class.getName(),
                "Upgrading database from version " + oldVersion + " to "
                        + newVersion + ", which will destroy all old data");
        db.execSQL("DROP TABLE IF EXISTS " + TABLE_INGREDIENTS);
        db.execSQL("DROP TABLE IF EXISTS " + TABLE_SHOPPINGLIST);
        db.execSQL("DROP TABLE IF EXISTS " + TABLE_RECIPES);
        db.execSQL("DROP TABLE IF EXISTS " + TABLE_RECIPEINGREDIENTS);
        db.execSQL("DROP TABLE IF EXISTS " + TABLE_UOM);
        db.execSQL("DROP TABLE IF EXISTS " + TABLE_INGREDIENTCATEGORIES);
        onCreate(db);
    }
}
