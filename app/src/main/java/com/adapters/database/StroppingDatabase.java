package com.adapters.database;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.SQLException;
import android.database.sqlite.SQLiteDatabase;

import com.classes.Ingredient;
import com.classes.Recipe;
import com.classes.ShoppingListItem;

import java.util.ArrayList;

/**
 * Created by Austen on 15/08/2016.
 */
public class StroppingDatabase {

    private SQLiteDatabase database;
    private DatabaseHelper dbHelper;
    private String[] ingredientsTableAllColumns = {DatabaseHelper.COLUMN_ID,
            DatabaseHelper.COLUMN_INGREDIENTNAME,
            DatabaseHelper.COLUMN_UOM,
            DatabaseHelper.COLUMN_DEFAULTVALUE,
            DatabaseHelper.COLUMN_QUANTITY,
            DatabaseHelper.COLUMN_FAVOURITE,
            DatabaseHelper.COLUMN_ESSENTIAL,
            DatabaseHelper.COLUMN_ADDED,
            DatabaseHelper.COLUMN_HIDDEN};

    private String[] shoppingListTableAllColumns = {DatabaseHelper.COLUMN_ID,
            DatabaseHelper.COLUMN_INGREDIENTID,
            DatabaseHelper.COLUMN_QUANTITY,
            DatabaseHelper.COLUMN_PURCHASED};

    private String[] RecipesAllColumns = {DatabaseHelper.COLUMN_ID,
            DatabaseHelper.COLUMN_RECIPENAME,
            DatabaseHelper.COLUMN_RECIPEIMAGE,
            DatabaseHelper.COLUMN_RECIPESERVES,
            DatabaseHelper.COLUMN_RECIPENOTES};

    private String[] RecipeIngredientsAllColumns = {DatabaseHelper.COLUMN_ID,
            DatabaseHelper.COLUMN_RECIPEID,
            DatabaseHelper.COLUMN_INGREDIENTID,
            DatabaseHelper.COLUMN_QUANTITY};

    public StroppingDatabase(Context context){
        dbHelper = new DatabaseHelper(context);
    }

    public void open() throws SQLException {
        database = dbHelper.getWritableDatabase();
    }

    public void close(){
        dbHelper.close();
    }

    //ShoppingList methods****************************************
    public ShoppingListItem createShoppingListItem(long ingredientId, int quantity, int isPurchased){
        ContentValues values = new ContentValues();
        values.put(DatabaseHelper.COLUMN_INGREDIENTID, ingredientId);
        values.put(DatabaseHelper.COLUMN_QUANTITY, quantity);
        values.put(DatabaseHelper.COLUMN_PURCHASED, isPurchased);
        long insertId = database.insert(DatabaseHelper.TABLE_SHOPPINGLIST, null, values);

        Cursor cursor = database.query(DatabaseHelper.TABLE_SHOPPINGLIST,
                shoppingListTableAllColumns, DatabaseHelper.COLUMN_ID + " = " + insertId, null,
                null, null, null);
        cursor.moveToFirst();
        ShoppingListItem newShoppingListItem = getShoppingListItem(cursor);
        cursor.close();
        return newShoppingListItem;
    }

    private ShoppingListItem getShoppingListItem(Cursor cursor) {
        ShoppingListItem newShoppingListItem = new ShoppingListItem();
        newShoppingListItem.setId(cursor.getLong(0));
        newShoppingListItem.setName(GetIngredientNameFromId(cursor.getLong(1)));
        newShoppingListItem.setIngredientId(cursor.getLong(1));
        newShoppingListItem.setQuantity(cursor.getInt(2));
        newShoppingListItem.setPurchased(cursor.getInt(3));
        return newShoppingListItem;
    }

    //Creates a list of all shoppinglist items in the db
    public ArrayList<ShoppingListItem> getAllShoppingListItems(){
        ArrayList<ShoppingListItem> shoppingListItems = new ArrayList<ShoppingListItem>();
        Cursor cursor = database.query(DatabaseHelper.TABLE_SHOPPINGLIST, shoppingListTableAllColumns,
                null, null, null, null, null);
        cursor.moveToFirst();
        while (!cursor.isAfterLast()){
            ShoppingListItem shoppingListItem = getShoppingListItem(cursor);
            shoppingListItems.add(shoppingListItem);
            cursor.moveToNext();
        }
        cursor.close();
        return shoppingListItems;
    }

    public void UpdateShoppingListItem(ShoppingListItem shoppingListItem){
        ContentValues values = new ContentValues();
        values.put(DatabaseHelper.COLUMN_INGREDIENTID, shoppingListItem.getIngredientId());
        values.put(DatabaseHelper.COLUMN_QUANTITY, shoppingListItem.getQuantity());
        values.put(DatabaseHelper.COLUMN_PURCHASED, shoppingListItem.getPurchased());
        database.update(DatabaseHelper.TABLE_SHOPPINGLIST, values, DatabaseHelper.COLUMN_ID + " = ?",
                new String[] { String.valueOf(shoppingListItem.getId()) });
    }

    public void DeleteAllRowsFromTable(String tableName) {
        database.delete(tableName, null, null);
    }

    //Ingredients methods****************************************
    private String GetIngredientNameFromId(long ingredientId){
        Cursor cursor = database.query(DatabaseHelper.TABLE_INGREDIENTS, ingredientsTableAllColumns,
                null, null, null, null, null);

        cursor.moveToFirst();
        while (!cursor.isAfterLast()){
            Ingredient ingredient = getIngredient(cursor);
            if (ingredient.getId() == ingredientId){
                String name = ingredient.getName() + " " + Integer.toString(ingredient.getDefaultValue()) + convertString(ingredient.getUOM());
                return name;
            }
            cursor.moveToNext();
        }
        cursor.close();
        return null;
    }

    public Ingredient GetIngredientFromId(long ingredientId){
        Cursor cursor = database.query(DatabaseHelper.TABLE_INGREDIENTS, ingredientsTableAllColumns,
                null, null, null, null, null);

        cursor.moveToFirst();
        while (!cursor.isAfterLast()){
            Ingredient ingredient = getIngredient(cursor);
            if (ingredient.getId() == ingredientId){
                return ingredient;
            }
            cursor.moveToNext();
        }
        cursor.close();
        return null;
    }

    public Ingredient createIngredient(String name, String uom, int defaultValue, int quantity, int isFavourite, int isEssential, int isAdded, int isHidden){
        ContentValues values = new ContentValues();
        values.put(DatabaseHelper.COLUMN_INGREDIENTNAME, name);
        values.put(DatabaseHelper.COLUMN_UOM, uom);
        values.put(DatabaseHelper.COLUMN_DEFAULTVALUE, defaultValue);
        values.put(DatabaseHelper.COLUMN_QUANTITY, quantity);
        values.put(DatabaseHelper.COLUMN_FAVOURITE, isFavourite);
        values.put(DatabaseHelper.COLUMN_ESSENTIAL, isEssential);
        values.put(DatabaseHelper.COLUMN_ADDED, isAdded);
        values.put(DatabaseHelper.COLUMN_HIDDEN, isHidden);
        long insertId = database.insert(DatabaseHelper.TABLE_INGREDIENTS, null,
                values);
        Cursor cursor = database.query(DatabaseHelper.TABLE_INGREDIENTS,
                ingredientsTableAllColumns, DatabaseHelper.COLUMN_ID + " = " + insertId, null,
                null, null, null);
        cursor.moveToFirst();
        Ingredient newIngredient = getIngredient(cursor);
        cursor.close();
        return newIngredient;
    }

    //TODO Make this a gen delete statement
    public void deleteIngredient(Ingredient ingredient){
        long id = ingredient.getId();
        System.out.println("Ingredient deleted with id: " + id);
        database.delete(DatabaseHelper.TABLE_INGREDIENTS, DatabaseHelper.COLUMN_ID
                + " = " + id, null);
    }

    public void UpdateIngredient(long id, String name, String uom, int defaultValue, int quantity, int isFavourite, int isEssential, int isAdded, int isHidden){
        ContentValues values = new ContentValues();
        values.put(DatabaseHelper.COLUMN_INGREDIENTNAME, name);
        values.put(DatabaseHelper.COLUMN_UOM, uom);
        values.put(DatabaseHelper.COLUMN_DEFAULTVALUE, defaultValue);
        values.put(DatabaseHelper.COLUMN_QUANTITY, quantity);
        values.put(DatabaseHelper.COLUMN_FAVOURITE, isFavourite);
        values.put(DatabaseHelper.COLUMN_ESSENTIAL, isEssential);
        values.put(DatabaseHelper.COLUMN_ADDED, isAdded);
        values.put(DatabaseHelper.COLUMN_HIDDEN, isHidden);
        database.update(DatabaseHelper.TABLE_INGREDIENTS, values, DatabaseHelper.COLUMN_ID + " = ?",
                new String[] { String.valueOf(id) });
    }

    //Creates a list of all ingredients in the db
    public ArrayList<Ingredient> getAllIngredients(){
        ArrayList<Ingredient> ingredients = new ArrayList<Ingredient>();
        Cursor cursor = database.query(DatabaseHelper.TABLE_INGREDIENTS, ingredientsTableAllColumns,
                null, null, null, null, DatabaseHelper.COLUMN_INGREDIENTNAME);
        cursor.moveToFirst();
        while (!cursor.isAfterLast()){
            Ingredient ingredient = getIngredient(cursor);
            ingredients.add(ingredient);
            cursor.moveToNext();
        }
        cursor.close();
        return ingredients;
    }

    //Converts a cursor value (db row) to a class
    private Ingredient getIngredient(Cursor cursor) {
        Ingredient ingredient = new Ingredient();
        ingredient.setId(cursor.getLong(0));
        ingredient.setName(cursor.getString(1));
        ingredient.setUOM(cursor.getString(2));
        ingredient.setDefaultValue(cursor.getInt(3));
        ingredient.setQuantity(cursor.getInt(4));
        ingredient.setFavourite(cursor.getInt(5));
        ingredient.setEssential(cursor.getInt(6));
        ingredient.setadded(cursor.getInt(7));
        ingredient.setHidden(cursor.getInt(8));
        return ingredient;
    }

    //Recipes methods****************************************
    public ArrayList<Recipe> getAllRecipes(){
        ArrayList<Recipe> recipes = new ArrayList<Recipe>();

        Cursor cursor = database.query(DatabaseHelper.TABLE_RECIPES, RecipesAllColumns,
                null, null, null, null, null);
        cursor.moveToFirst();
        while (!cursor.isAfterLast()){
            Recipe recipe = getRecipe(cursor);
            recipes.add(recipe);
            cursor.moveToNext();
        }
        cursor.close();
        return recipes;

    }

    public Recipe createRecipe(String name, int serves, String notes){
        ContentValues values = new ContentValues();
        values.put(DatabaseHelper.COLUMN_RECIPENAME, name);
        values.put(DatabaseHelper.COLUMN_RECIPESERVES, serves);
        values.put(DatabaseHelper.COLUMN_RECIPENOTES, notes);
        long insertId = database.insert(DatabaseHelper.TABLE_RECIPES, null,
                values);
        Cursor cursor = database.query(DatabaseHelper.TABLE_RECIPES,
                RecipesAllColumns, DatabaseHelper.COLUMN_ID + " = " + insertId, null,
                null, null, null);
        cursor.moveToFirst();
        Recipe newRecipe = getRecipe(cursor);
        cursor.close();
        return newRecipe;
    }

    private Recipe getRecipe(Cursor cursor) {
        Recipe recipe = new Recipe();
        recipe.setId(cursor.getLong(0));
        recipe.setName(cursor.getString(1));
        recipe.setRecipeImage(cursor.getInt(2));
        recipe.setServes(cursor.getInt(3));
        recipe.setNotes(cursor.getString(4));
        return recipe;
    }

    public void deleteRecipe(Recipe recipe){
        long id = recipe.getId();
        System.out.println("Recipe delete with id: " + id);
        database.delete(DatabaseHelper.TABLE_RECIPES, DatabaseHelper.COLUMN_ID
                + " = " + id, null);
    }

    private CharSequence convertString(String convertString) {

        if (convertString.equals("number of")) {
            return "";
        }
        else if (convertString.equals("grams")) {
            return "g";
        }
        else if (convertString.equals("kilograms")) {
            return "kg";
        }
        else if (convertString.equals("liters")) {
            return "l";
        }
        else if (convertString.equals("milliliters")) {
            return "ml";
        }
        else if (convertString.equals("pints")) {
            return "pt";
        }
        return convertString;
    }
}
