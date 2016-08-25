package com.oz10.stropping;

import android.content.Intent;
import android.os.Bundle;
import android.support.design.widget.FloatingActionButton;
import android.support.design.widget.Snackbar;
import android.support.v7.app.ActionBar;
import android.support.v7.app.AppCompatActivity;
import android.support.v7.widget.Toolbar;
import android.view.Menu;
import android.view.MenuInflater;
import android.view.MenuItem;
import android.view.View;
import android.widget.EditText;
import android.widget.TextView;

import com.adapters.database.StroppingDatabase;
import com.classes.Ingredient;

public class IngredientEditActivity extends AppCompatActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_ingredient_edit);

        SetupActionbar();

        Intent intent = getIntent();
        if (intent != null){
            Long ingredientId = intent.getLongExtra("IngredientId", 0);

            if (ingredientId != 0){
                StroppingDatabase db = new StroppingDatabase(this);
                db.open();

                Ingredient ingredient = db.getIngredientFromId(ingredientId);
                EditText ingredientName = (EditText) findViewById(R.id.ingredient_edit_name);
                ingredientName.setText(ingredient.getName());

//                EditText defaultValue = (EditText) findViewById(R.id.ingredient_edit_defaultvalue_value);
//                defaultValue.setText(ingredient.getDefaultValue());
//
//                EditText quantity = (EditText) findViewById(R.id.ingredient_edit_quantity_value);
//                quantity.setText(ingredient.getQuantity());

                db.close();
            }

        }
    }

    private void SetupActionbar()
    {
        ActionBar actionBar = getSupportActionBar();
        actionBar.setDisplayHomeAsUpEnabled(true);
    }

    @Override
    public boolean onCreateOptionsMenu(Menu menu) {
        MenuInflater inflater = getMenuInflater();
        inflater.inflate(R.menu.menu_ok_only, menu);
        return true;
    }

    public boolean onOptionsItemSelected(MenuItem item){
        //TODO Refactor
        if (item.getItemId() == android.R.id.home){
            finish();
            return true;
        }
        else if (item.getItemId() == R.id.action_menu_ok){
            finish();
        }

        return true;
    }

}
