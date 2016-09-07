package com.adapters.database;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.SQLException;
import android.database.sqlite.SQLiteDatabase;
import android.provider.ContactsContract;

import com.classes.Ingredient;
import com.classes.QuantityItem;
import com.classes.Recipe;
import com.classes.ShoppingListItem;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;

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
        
        // Check if ingredient has already been added to the shopping list
        ShoppingListItem shoppingListItem = getShoppingListItemByIngredientId(ingredientId);
        
        if (shoppingListItem != null){
            shoppingListItem.setQuantity(shoppingListItem.getQuantity() + quantity);
            updateShoppingListItem(shoppingListItem);
        }else{
            ContentValues values = new ContentValues();
            values.put(DatabaseHelper.COLUMN_INGREDIENTID, ingredientId);
            values.put(DatabaseHelper.COLUMN_QUANTITY, quantity);
            values.put(DatabaseHelper.COLUMN_PURCHASED, isPurchased);
            long insertId = database.insert(DatabaseHelper.TABLE_SHOPPINGLIST, null, values);
    
            Cursor cursor = database.query(DatabaseHelper.TABLE_SHOPPINGLIST,
                    shoppingListTableAllColumns, DatabaseHelper.COLUMN_ID + " = " + insertId, null,
                    null, null, null);
            cursor.moveToFirst();
            shoppingListItem = getShoppingListItem(cursor);
            cursor.close();
        }
        
        return shoppingListItem;
    }

    private ShoppingListItem getShoppingListItem(Cursor cursor) {
        ShoppingListItem newShoppingListItem = new ShoppingListItem();
        newShoppingListItem.setId(cursor.getLong(0));
        newShoppingListItem.setName(getIngredientNameFromId(cursor.getLong(1)));
        newShoppingListItem.setIngredientId(cursor.getLong(1));

        // Get UOM from ingredient
        Ingredient ingredient = getIngredientFromId(newShoppingListItem.getIngredientId());
        if (ingredient != null){
            newShoppingListItem.setUOM(ingredient.getUOM());
        }

        newShoppingListItem.setQuantity(cursor.getInt(2));
        newShoppingListItem.setPurchased(cursor.getInt(3));
        

        
        return newShoppingListItem;
    }
    
    private ShoppingListItem getShoppingListItemByIngredientId(long ingredientId) {
        
        ShoppingListItem shoppingListItem = null;
        
        Cursor cursor = database.query(DatabaseHelper.TABLE_SHOPPINGLIST,
                shoppingListTableAllColumns, DatabaseHelper.COLUMN_INGREDIENTID + " = " + ingredientId, null,
                null, null, null);
        if (cursor.moveToFirst()){
            shoppingListItem = getShoppingListItem(cursor);
        }
        
        cursor.close();
        
        return shoppingListItem;
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

    public void updateShoppingListItem(ShoppingListItem shoppingListItem){
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

    public void ResetAllTables()
    {
        database.delete(DatabaseHelper.TABLE_INGREDIENTS,null,null);
        database.delete(DatabaseHelper.TABLE_RECIPEINGREDIENTS,null,null);
        database.delete(DatabaseHelper.TABLE_RECIPES,null,null);
        database.delete(DatabaseHelper.TABLE_SHOPPINGLIST,null,null);
    }

    //Ingredients methods****************************************
    private String getIngredientNameFromId(long ingredientId){
        Cursor cursor = database.query(DatabaseHelper.TABLE_INGREDIENTS, ingredientsTableAllColumns,
                null, null, null, null, null);

        cursor.moveToFirst();
        while (!cursor.isAfterLast()){
            Ingredient ingredient = getIngredient(cursor);
            if (ingredient.getId() == ingredientId){
                String name = ingredient.getName(); // + " " + Integer.toString(ingredient.getDefaultValue()) + convertString(ingredient.getUOM());
                return name;
            }
            cursor.moveToNext();
        }
        cursor.close();
        return null;
    }

    public Ingredient getIngredientFromId(Long ingredientId){
        Cursor cursor = database.query(DatabaseHelper.TABLE_INGREDIENTS, ingredientsTableAllColumns,
                null, null, null, null, null);

        cursor.moveToFirst();
        while (!cursor.isAfterLast()){
            Ingredient ingredient = getIngredient(cursor);

            if (ingredientId.equals((ingredient.getId()))){
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

    public void updateIngredient(long id, String name, String uom, int defaultValue, int quantity, int isFavourite, int isEssential, int isAdded, int isHidden){
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
        
        // Sort list
        //TODO Make this a generic call that can be used by any method
        Collections.sort(ingredients, new Comparator<Ingredient>(){
           @Override
           public int compare(Ingredient i1, Ingredient i2){
               return i1.getName().compareToIgnoreCase(i2.getName());
           }
        });
        
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

        Recipe recipe = getRecipeById(insertId);
        return recipe;
    }

    public Recipe createRecipe(String name, int serves, String notes, ArrayList<QuantityItem> recipeIngredients){
        ContentValues values = new ContentValues();
        values.put(DatabaseHelper.COLUMN_RECIPENAME, name);
        values.put(DatabaseHelper.COLUMN_RECIPESERVES, serves);
        values.put(DatabaseHelper.COLUMN_RECIPENOTES, notes);
        long insertId = database.insert(DatabaseHelper.TABLE_RECIPES, null,
                values);

        Recipe recipe = getRecipeById(insertId);

        addIngredientsToRecipe(recipe.getId(), recipeIngredients);

        return recipe;
    }

    public ArrayList<Ingredient> getRecipeIngredientsById(long id)
    {
        ArrayList<Ingredient> ingredientArrayList = new ArrayList<>();

        Cursor cursor = database.query(DatabaseHelper.TABLE_RECIPEINGREDIENTS,
                                        RecipeIngredientsAllColumns, DatabaseHelper.COLUMN_RECIPEID + "=" + id,
                                        null, null, null, null);
        cursor.moveToFirst();
        while (!cursor.isAfterLast()){
            Ingredient ingredient = getIngredientFromId(cursor.getLong(2));
            // Set quantity from recipe-ingredients table
            ingredient.setQuantity(cursor.getInt(3));
            ingredientArrayList.add(ingredient);
            cursor.moveToNext();
        }
        cursor.close();

        return ingredientArrayList;
    }

    public Recipe getRecipeById(long id)
    {
        Cursor cursor = database.query(DatabaseHelper.TABLE_RECIPES,
                RecipesAllColumns, DatabaseHelper.COLUMN_ID + " = " + id, null,
                null, null, null);

        cursor.moveToFirst();
        Recipe recipe = getRecipe(cursor);
        cursor.close();
        return recipe;
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

    public void updateRecipe(long id, String name, int serves, String notes, ArrayList<QuantityItem> ingredients){
        ContentValues values = new ContentValues();
        values.put(DatabaseHelper.COLUMN_RECIPENAME, name);
        values.put(DatabaseHelper.COLUMN_RECIPESERVES, serves);
        values.put(DatabaseHelper.COLUMN_RECIPENOTES, notes);
        //TODO Does this update statement need the String.valueOf(id) statement?
        database.update(DatabaseHelper.TABLE_RECIPES, values, DatabaseHelper.COLUMN_ID + " = ?",
                new String[] { String.valueOf(id) });

        addIngredientsToRecipe(id, ingredients);
    }

    public void deleteRecipe(Recipe recipe){
        long id = recipe.getId();
        System.out.println("Recipe delete with id: " + id);
        database.delete(DatabaseHelper.TABLE_RECIPES, DatabaseHelper.COLUMN_ID
                + " = " + id, null);
    }

    public void deleteIngredientFromRecipe(long ingredientId)
    {
        int i = database.delete(DatabaseHelper.TABLE_RECIPEINGREDIENTS, DatabaseHelper.COLUMN_INGREDIENTID + "=" + ingredientId, null);
    }

    public void deleteAllIngredientsFromRecipe(long recipeId)
    {
        database.delete(DatabaseHelper.TABLE_RECIPEINGREDIENTS, DatabaseHelper.COLUMN_RECIPEID + "=" + recipeId, null);
    }

    public void addIngredientsToRecipe(Long recipeId, ArrayList<QuantityItem> ingredients)
    {
        // Save recipe's ingredients
        // METHOD:  This might not be the best way to do this but...
        //          First, delete all current recipe > ingredients rows
        //          Add ingredients to recipe
        //          Otherwise simply running update statements might
        //          fail if the recipe is not already linked to the ingredient (i think)
        deleteAllIngredientsFromRecipe(recipeId);

        for (QuantityItem ingredient:ingredients
                ) {
            ContentValues values = new ContentValues();
            values.put(DatabaseHelper.COLUMN_INGREDIENTID, ingredient.getId().toString());
            values.put(DatabaseHelper.COLUMN_RECIPEID, recipeId);
            values.put(DatabaseHelper.COLUMN_QUANTITY, ingredient.getQuantity());
            database.insert(DatabaseHelper.TABLE_RECIPEINGREDIENTS, null, values);
        }
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
